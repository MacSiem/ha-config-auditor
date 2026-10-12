'use strict';
// Catches truthy/missing OS metadata being counted as a verified success.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../ha-config-auditor.js'), 'utf8');

async function auditOs(os, language = 'en') {
  const dom = new JSDOM('<body></body>', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: new VirtualConsole() });
  try {
    dom.window.eval(source);
    const card = dom.window.document.createElement('ha-config-auditor');
    card.setConfig({ type: 'custom:ha-config-auditor' });
    dom.window.document.body.append(card);
    card.hass = {
      user: { id: 'synthetic-admin', is_admin: true }, language, states: {},
      config: { components: [], version: '2026.10.0' }, themes: { darkMode: false },
      callWS: async (msg) => {
        if (msg.type === 'supervisor/api' && msg.endpoint === '/os/info') return { data: os };
        if (msg.type === 'ha_config_auditor/audit') return { version: '6.0.2', findings: [] };
        if (msg.type === 'config/auth/list' || msg.type === 'config_entries/get') return [];
        const error = new Error('Unavailable in synthetic fixture'); error.code = 'unknown_command'; throw error;
      },
      callApi: async () => { throw new Error('Unavailable in synthetic fixture'); },
      connection: { subscribeEvents: async () => () => {} },
    };
    for (let i = 0; i < 100 && (card._loading || !card._auditData); i++) await new Promise(r => setTimeout(r, 5));
    assert.ok(card._auditData && !card._loading, 'audit completed');
    const data = card._auditData;
    return { data, text: card._renderFindings(data) };
  } finally { dom.window.close(); }
}

for (const [description, os] of [
  ['missing availability', { version: '18.3' }],
  ['null availability', { version: '18.3', update_available: null }],
  ['string availability', { version: '18.3', update_available: 'false' }],
  ['numeric availability', { version: '18.3', update_available: 0 }],
  ['missing version', { update_available: false }],
  ['malformed version', { version: { private: 'payload' }, update_available: false }],
  ['empty response', {}],
]) {
  test(`OS ${description} remains not checked and outside success count`, async () => {
    const { data, text } = await auditOs(os);
    assert.equal(data.findings.pass.some(f => f.id === 'os_update'), false);
    assert.equal(data.findings.warning.some(f => f.id === 'os_update'), false);
    const finding = data.findings.info.find(f => f.id === 'os_update');
    assert.ok(finding, 'incomplete OS check stays visible');
    assert.equal(finding.resultState, 'not_checked');
    assert.equal(data.passCount, data.findings.pass.length);
    assert.match(text, /Not checked/);
    assert.doesNotMatch(text, /\[object Object\]/);
  });
}

test('explicit false with real OS version is success', async () => {
  const { data } = await auditOs({ version: '18.3', update_available: false });
  assert.equal(data.findings.pass.find(f => f.id === 'os_update')?.resultState, 'success');
});
test('explicit true with real OS version is an update warning', async () => {
  const { data } = await auditOs({ version: '18.3', version_latest: '18.4', update_available: true });
  assert.equal(data.findings.pass.some(f => f.id === 'os_update'), false);
  assert.ok(data.findings.warning.some(f => f.id === 'os_update'));
});
test('Polish incomplete OS result uses the visible not-checked label', async () => {
  const { text } = await auditOs({ version: '18.3' }, 'pl');
  assert.match(text, /Nie sprawdzono/);
  assert.doesNotMatch(text, /HA OS jest aktualny/);
});

test('W4 renders six distinct result states with localized labels and no success fallback', () => {
  const helper = path.join(__dirname, '../shared/ha-tools-ui.js');
  assert.ok(fs.existsSync(helper), 'canonical W4 result renderer exists');
  const { createUiV3 } = require(helper);
  const expected = [
    ['success', 'Success', 'Sukces', '✓'], ['partial', 'Partial', 'Częściowo', '½'],
    ['unconfirmed', 'Unconfirmed', 'Niepotwierdzony', '?'], ['error', 'Error', 'Błąd', '✕'],
    ['not_checked', 'Not checked', 'Nie sprawdzono', '–'], ['no_data', 'No data', 'Brak danych', '∅'],
  ];
  for (const [language, column] of [['en', 1], ['pl', 2]]) {
    const ui = createUiV3({ language });
    for (const row of expected) {
      const dom = new JSDOM(ui.statusHtml(row[0]));
      assert.equal(dom.window.document.body.textContent.trim(), `${row[3]} ${row[column]}`);
      assert.equal(ui.status(row[0]).countsAsSuccess, row[0] === 'success');
      assert.ok(dom.window.document.querySelector(`[data-result-state="${row[0]}"]`));
      dom.window.close();
    }
    assert.equal(ui.status(null).countsAsSuccess, false);
    assert.equal(ui.status('unexpected').code, 'not_checked');
  }
});
