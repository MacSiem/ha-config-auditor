const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');

function fixture(admin = true, language = 'en', gate = null) {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://qa.invalid/', virtualConsole: new VirtualConsole() });
  dom.window.eval(fs.readFileSync('ha-config-auditor.js', 'utf8'));
  const card = dom.window.document.createElement('ha-config-auditor'); card.setConfig({ show_support: false }); dom.window.document.body.append(card);
  const requests = [];
  const hass = { language, themes: {}, states: {}, user: { id: 'qa-user', is_admin: admin }, config: { components: [], external_url: null, version: '2026.9.3' },
    callWS: async message => {
      requests.push(message);
      if (gate && message.type === 'supervisor/api' && message.endpoint === '/host/info') return gate;
      if (message.type === 'config/auth/list') return [{ name: 'QA_PRIVATE_ADMIN', is_owner: true, is_active: true }];
      if (message.type === 'config_entries/get') return [];
      throw Error('Synthetic unavailable');
    }, callApi: async () => { throw Error('Synthetic unavailable'); } };
  card.hass = hass;
  return { dom, card, hass, requests };
}
async function settle(f) {
  for (let i = 0; i < 50 && f.card._loading; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.card._loading, false, 'synthetic audit must finish');
}

test('household and unresolved initial roles do not request privileged audit data', async () => {
  for (const admin of [false, undefined]) {
    const f = fixture(admin);
    try { await settle(f); assert.equal(f.requests.length, 0); assert.equal(f.card._auditData, null); }
    finally { f.dom.window.close(); }
  }
});

test('ordinary role loss removes cached user data immediately inside the render throttle', async () => {
  const f = fixture();
  try {
    await settle(f); f.card.shadowRoot.querySelector('[data-tab="users"]').click();
    assert.match(f.card.shadowRoot.textContent, /QA_PRIVATE_ADMIN/);
    const reads = f.requests.length;
    f.card.hass = { ...f.hass, user: { id: 'qa-user', is_admin: false } };
    assert.doesNotMatch(f.card.shadowRoot.textContent, /QA_PRIVATE_ADMIN/);
    assert.equal(f.card._auditData, null); assert.equal(f.requests.length, reads);
  } finally { f.dom.window.close(); }
});

test('late administrator audit response cannot repopulate data or send more reads after role loss', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const f = fixture(true, 'en', pending);
  try {
    assert.equal(f.requests.length, 1);
    f.card.hass = { ...f.hass, user: { id: 'qa-user', is_admin: false } };
    release({}); await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(f.requests.length, 1); assert.equal(f.card._auditData, null);
    assert.doesNotMatch(f.card.shadowRoot.textContent, /QA_PRIVATE_ADMIN/);
  } finally { f.dom.window.close(); }
});

test('ordinary household language changes update the permission message without audit reads', async () => {
  const f = fixture(false);
  try {
    await settle(f); assert.match(f.card.shadowRoot.textContent, /administrator/);
    f.card.hass = { ...f.hass, language: 'pl' };
    assert.match(f.card.shadowRoot.textContent, /administratora/);
    assert.equal(f.requests.length, 0);
  } finally { f.dom.window.close(); }
});
