'use strict';
// The card must show server-verified findings from the integration and never
// invent auth/HTTP results it cannot read from the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const CARD = fs.readFileSync(path.join(ROOT, 'ha-config-auditor.js'), 'utf8');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const REPORT = {
  version: '6.0.0',
  findings: [
    { id: 'auth_legacy_api_password', status: 'fail', title: 'Legacy API password login is enabled', detail: 'd1', fix: 'f1' },
    { id: 'auth_admin_mfa', status: 'warning', title: '1 administrator(s) without two-factor authentication', detail: 'd2', fix: 'f2' },
    { id: 'http_ip_ban', status: 'pass', title: 'Failed logins lead to an IP ban', detail: 'd3', fix: null },
    { id: 'http_trusted_proxies', status: 'skipped', title: 'Trusted proxies could not be read', detail: 'd4', fix: null },
  ],
};

function hass(server, config = {}, responses = {}) {
  return {
    states: {}, language: 'en', themes: { darkMode: false },
    user: { is_admin: true }, config: { components: [], external_url: null, version: '2026.9.3', ...config },
    callWS: async (msg) => {
      if (msg.type === 'auth/long_lived_access_token/list') throw new Error('unsupported obsolete token API');
      if (['auth/refresh_tokens', 'network'].includes(msg.type) && Object.hasOwn(responses, msg.type)) {
        if (responses[msg.type] instanceof Error) throw responses[msg.type];
        return responses[msg.type];
      }
      if (msg.type === 'supervisor/api' && Object.hasOwn(responses, msg.endpoint)) return responses[msg.endpoint];
      if (msg.type === 'ha_config_auditor/audit') {
        if (server) return server;
        const err = new Error('Unknown command.'); err.code = 'unknown_command'; throw err;
      }
      if (msg.type === 'config/auth/list') {
        if (Object.hasOwn(responses, msg.type)) {
          if (responses[msg.type] instanceof Error) throw responses[msg.type];
          return responses[msg.type];
        }
        return [{ name: 'Admin', is_owner: true, is_active: true }];
      }
      if (msg.type === 'config_entries/get') {
        if (Object.hasOwn(responses, msg.type)) {
          if (responses[msg.type] instanceof Error) throw responses[msg.type];
          return responses[msg.type];
        }
        return [];
      }
      throw new Error('not supported');
    },
    callApi: async () => { throw new Error('not supported'); },
    callService: async () => ({}),
    connection: { subscribeEvents: async () => () => {}, subscribeMessage: async () => () => {} },
  };
}

async function audit(server, config = {}, responses = {}) {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom.window;
  w.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  w.eval(CARD);
  const card = w.document.createElement('ha-config-auditor');
  card.setConfig({ type: 'custom:ha-config-auditor' });
  w.document.body.appendChild(card);
  card.hass = hass(server, config, responses);
  for (let i = 0; i < 50 && (card._loading || !card._auditData); i++) await delay(20);
  const data = card._auditData;
  const html = card.shadowRoot.innerHTML;
  const findingsHtml = card._renderFindings(data);
  const addonsHtml = card._renderAddonsSection(data);
  const networkHtml = card._renderNetwork(data);
  const integrationsHtml = card._renderIntegrationsSection(data);
  w.close();
  return { data, html, findingsHtml, addonsHtml, networkHtml, integrationsHtml };
}

const ids = (list) => list.map((f) => f.id);

test('selected tab follows the visible content immediately after navigation', async () => {
  const { data } = await audit(null, {}, { 'config/auth/list': new Error('unauthorized') });
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { runScripts: 'dangerously', url: 'http://localhost/' });
  try {
    dom.window.eval(CARD);
    const card = dom.window.document.createElement('ha-config-auditor');
    card.setConfig({ type: 'custom:ha-config-auditor' });
    dom.window.document.body.appendChild(card);
    card._hass = hass(null);
    card._loading = false;
    card._auditData = data;
    card._render();
    for (const tab of ['users', 'tips', 'overview']) {
      const button = card.shadowRoot.querySelector(`[data-tab="${tab}"]`);
      button.click();
      assert.equal(button.getAttribute('aria-selected'), 'true');
      assert.equal(card.shadowRoot.querySelectorAll('[role="tab"][aria-selected="true"]').length, 1);
      assert.equal(card._activeTab, tab);
      if (tab === 'users') assert.match(card.shadowRoot.getElementById('content').textContent, /User accounts are unavailable/);
    }
  } finally { dom.window.close(); }
});

test('server findings are placed by status and marked as server-verified', async () => {
  const { data, findingsHtml } = await audit(REPORT);
  assert.equal(data.serverVersion, '6.0.0');
  assert.ok(ids(data.findings.critical).includes('server_auth_legacy_api_password'));
  assert.ok(ids(data.findings.warning).includes('server_auth_admin_mfa'));
  assert.ok(ids(data.findings.pass).includes('server_http_ip_ban'));
  const skipped = data.findings.info.find((f) => f.id === 'server_http_trusted_proxies');
  assert.ok(skipped && skipped.verified === false && /not checked/.test(skipped.title));
  assert.equal((findingsHtml.match(/badge-verified/g) || []).length, 3);
});

test('without the integration nothing about auth or HTTP is guessed', async () => {
  const { data } = await audit(null);
  const all = [...data.findings.critical, ...data.findings.warning, ...data.findings.info, ...data.findings.pass];
  assert.ok(ids(all).includes('server_checks_unavailable'));
  for (const fake of ['dns_rebind', 'trusted_networks', 'legacy_api_password', 'ip_bans', 'login_attempts', 'ip_ban_disabled', 'x_forwarded_for_unprotected']) {
    assert.ok(!ids(all).includes(fake), `unexpected browser-side guess: ${fake}`);
  }
});

test('the integration ships the same card as the plugin', () => {
  const www = fs.readFileSync(path.join(ROOT, 'custom_components/ha_config_auditor/www/ha-config-auditor.js'), 'utf8');
  assert.equal(www, CARD);
});

test('configured external HTTPS URL is not reported as a verified connection', async () => {
  const { data } = await audit(null, { external_url: 'https://example.invalid' });
  assert.ok(!ids(data.findings.pass).includes('ssl_external'));
  assert.ok(ids(data.findings.info).includes('ssl_external'));
});

test('Supervisor installed addon summaries do not require an installed flag', async () => {
  const addons = Array.from({ length: 21 }, (_, i) => ({ slug: `qa_${i}`, name: `QA ${i}`, version: '1.0', state: 'started', update_available: false }));
  const { data, addonsHtml, networkHtml } = await audit(REPORT, {}, { '/addons': { addons } });
  assert.equal(data.addons.length, 21, 'real /addons response already lists installed addons');
  assert.ok(!addonsHtml.includes('On</td>'), 'missing protection/auto-update must not be claimed enabled');
  assert.ok((addonsHtml.match(/N\/A/g) || []).length >= 63, 'missing protection, auto-update and host-network must be unknown');
  assert.ok(!networkHtml.includes('No addons exposing ports'), 'missing port inventory cannot prove no exposure');
});

test('unavailable addon inventory differs from a measured empty inventory', async () => {
  const missing = await audit(REPORT, {}, { '/os/info': { version: '1.0' } });
  assert.ok(missing.addonsHtml.includes('unavailable'));
  assert.ok(!missing.addonsHtml.includes('No addons installed'));
  const empty = await audit(REPORT, {}, { '/addons': { addons: [] } });
  assert.ok(empty.addonsHtml.includes('No addons installed'));
  assert.ok(empty.networkHtml.includes('No addons exposing ports'));
});

test('explicit false addon metadata remains a measured disabled value', async () => {
  const { addonsHtml } = await audit(REPORT, {}, { '/addons': { addons: [{ slug: 'qa', name: 'QA', version: '1.0', state: 'started', protected: false, auto_update: false, host_network: false, network: {} }] } });
  assert.ok(addonsHtml.includes('Off</td>'));
  assert.ok(addonsHtml.includes('No</td>'));
  assert.ok(!addonsHtml.includes('N/A'));
});


test('denied or malformed user inventory never reports a measured zero', async () => {
  for (const response of [new Error('unauthorized'), null, { error: 'unavailable' }]) {
    const { data, html } = await audit(null, {}, { 'config/auth/list': response });
    const dom = new JSDOM(html);
    const label = [...dom.window.document.querySelectorAll('div')].find(el => el.textContent === 'User accounts unavailable');
    assert.ok(label, 'missing account inventory must be explicit');
    assert.equal(label.previousElementSibling.textContent, 'N/A');
    assert.ok(ids(data.findings.info).includes('user_inventory_unavailable'));
    dom.window.close();
  }
});

test('a measured empty or populated user inventory retains its actual count', async () => {
  for (const [response, count] of [[[], '0'], [[{ name: 'QA', is_active: true }], '1']]) {
    const { html } = await audit(null, {}, { 'config/auth/list': response });
    const dom = new JSDOM(html);
    const label = [...dom.window.document.querySelectorAll('div')].find(el => el.textContent === 'User accounts');
    assert.ok(label);
    assert.equal(label.previousElementSibling.textContent, count);
    dom.window.close();
  }
});


test('denied or malformed integration inventory is unavailable in all visible summaries', async () => {
  for (const response of [new Error('unauthorized'), null, { error: 'unavailable' }, [null]]) {
    const { html, integrationsHtml, networkHtml } = await audit(null, { components: ['frontend', 'http'] }, { 'config_entries/get': response });
    const dom = new JSDOM(html);
    try {
      const label = [...dom.window.document.querySelectorAll('div')].find(el => el.textContent === 'Integrations unavailable');
      assert.ok(label, 'failed inventory must not show a measured zero');
      assert.equal(label.previousElementSibling.textContent, 'N/A');
      assert.match(integrationsHtml, /unavailable/i);
      assert.doesNotMatch(integrationsHtml, /No integrations configured/);
      assert.match(networkHtml, /Integrations<\/span><span>N\/A/);
      assert.doesNotMatch(networkHtml, /2 entries/);
    } finally { dom.window.close(); }
  }
});

test('measured empty and populated integration inventories keep their count without component fallback', async () => {
  for (const [response, count] of [[[], '0'], [[{ domain: 'qa', title: 'QA', source: 'user', state: 'loaded' }], '1']]) {
    const { html, networkHtml } = await audit(null, { components: ['frontend', 'http'] }, { 'config_entries/get': response });
    const dom = new JSDOM(html);
    try {
      const label = [...dom.window.document.querySelectorAll('div')].find(el => el.textContent === 'Integrations');
      assert.ok(label);
      assert.equal(label.previousElementSibling.textContent, count);
      assert.match(networkHtml, new RegExp('Integrations<\\/span><span>' + count + ' entries'));
    } finally { dom.window.close(); }
  }
});

test('Network HTTPS details describe configuration without claiming tested security', async () => {
  const { networkHtml } = await audit(null, { external_url: 'https://example.invalid', internal_url: 'https://local.invalid' });
  const dom = new JSDOM(networkHtml);
  try {
    const external = [...dom.window.document.querySelectorAll('.finding')].find(el => el.textContent.includes('example.invalid'));
    const internal = [...dom.window.document.querySelectorAll('.finding')].find(el => el.textContent.includes('local.invalid'));
    assert.ok(external && internal);
    for (const finding of [external, internal]) {
      assert.ok(!finding.classList.contains('pass'), 'URL syntax cannot prove a secure connection');
      assert.doesNotMatch(finding.textContent, /Secure|INSECURE/);
      assert.match(finding.textContent, /not tested|not checked/i);
    }
  } finally { dom.window.close(); }
});


test('loaded cloud component is information, not proof of an active remote tunnel', async () => {
  const { networkHtml } = await audit(null, { components: ['cloud'] });
  const dom = new JSDOM(networkHtml);
  try {
    const cloud = [...dom.window.document.querySelectorAll('.finding')].find(el => el.textContent.includes('Nabu Casa'));
    assert.ok(cloud);
    assert.ok(!cloud.classList.contains('pass'));
    assert.doesNotMatch(cloud.textContent, /ACTIVE|Secure remote access/);
    assert.match(cloud.textContent, /loaded|component/i);
    assert.match(cloud.textContent, /not checked|not tested/i);
    assert.doesNotMatch(networkHtml, /homeassistant.local:8123/);
  } finally { dom.window.close(); }
});

test('adapter configuration does not imply link state and zero signal stays measured', async () => {
  const interfaces = [{ interface: 'configured', enabled: true, wifi: { signal: 0 } }, { interface: 'unknown' }, { interface: 'disabled', enabled: false }];
  const { networkHtml } = await audit(null, {}, { '/network/info': { interfaces } });
  const dom = new JSDOM(networkHtml);
  try {
    const rows = [...dom.window.document.querySelectorAll('.finding')].filter(el => el.querySelector('.finding-title')?.textContent.includes('(unknown)'));
    assert.equal(rows.length, 3);
    assert.match(rows[0].textContent, /Enabled/);
    assert.match(rows[0].textContent, /0%/);
    assert.match(rows[1].textContent, /N\/A/);
    assert.match(rows[2].textContent, /Disabled/);
    for (const row of rows) assert.doesNotMatch(row.querySelector('.finding-badge').textContent, /UP|DOWN/);
  } finally { dom.window.close(); }
});

test('Core network adapter fallback preserves unknown and disabled states without claiming connectivity', async () => {
  const { networkHtml } = await audit(null, {}, { network: { adapters: [{ name: 'qa', enabled: true, ipv4: [] }, { name: 'disabled', enabled: false, ipv4: [] }, { name: 'unknown', ipv4: [] }] } });
  assert.match(networkHtml, /disabled/);
  assert.match(networkHtml, /unknown/);
  const dom = new JSDOM(networkHtml);
  try { for (const badge of dom.window.document.querySelectorAll('.finding-badge')) assert.doesNotMatch(badge.textContent, /UP|DOWN/); }
  finally { dom.window.close(); }
});

test('config-flow source stays visible without inventing Core or HACS origin', async () => {
  const entries = ['user', 'custom', 'hacs', undefined].map((source, i) => ({ domain: 'qa' + i, title: 'QA' + i, source, state: 'loaded' }));
  const { integrationsHtml } = await audit(null, {}, { 'config_entries/get': entries });
  const dom = new JSDOM(integrationsHtml);
  try {
    const rows = [...dom.window.document.querySelectorAll('tbody tr')];
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map(row => row.children[2].textContent.trim()), ['user', 'custom', 'hacs', 'N/A']);
    assert.doesNotMatch(integrationsHtml, /Core:|HACS:|📦 Core|🏪 HACS/);
    assert.ok(rows.every(row => row.children[3].textContent.includes('loaded')));
  } finally { dom.window.close(); }
});

test('only explicit current-account long-lived token metadata counts, never user sessions', async () => {
  const responses = { 'config/auth/list': [{ name: 'QA', refresh_tokens: [{ type: 'normal' }] }], 'auth/refresh_tokens': [{ type: 'normal' }, { type: 'long_lived_access_token' }, { type: 'system' }] };
  const { data, findingsHtml } = await audit(null, {}, responses);
  const tokens = [...data.findings.info, ...data.findings.warning].filter(f => f.id === 'access_tokens' || f.id === 'many_tokens');
  assert.equal(tokens.length, 1);
  assert.match(tokens[0].title, /1 long-lived/);
  assert.match(tokens[0].desc, /current account|current administrator/i);
  assert.doesNotMatch(tokens[0].title, /user\(s\)/);
  assert.doesNotMatch(findingsHtml, /normal|system token|last_used_ip/);
});

test('unavailable or malformed token metadata is explicitly not checked, not silently empty', async () => {
  for (const response of [new Error('unauthorized'), null, {}, [{}]]) {
    const { data } = await audit(null, {}, { 'auth/refresh_tokens': response, 'config/auth/list': [{ name: 'QA', refresh_tokens: [{ type: 'normal' }] }] });
    assert.ok(data.findings.info.some(f => f.id === 'access_tokens_unavailable' && /not checked/i.test(f.title)));
    assert.ok(![...data.findings.info, ...data.findings.warning].some(f => f.id === 'access_tokens' || f.id === 'many_tokens'));
  }
});

test('an available token metadata list with only sessions reports measured zero for the current account', async () => {
  const { data } = await audit(null, {}, { 'auth/refresh_tokens': [{ type: 'normal' }] });
  const token = data.findings.info.find(f => f.id === 'access_tokens');
  assert.ok(token);
  assert.match(token.title, /0 long-lived/);
  assert.match(token.desc, /current account|current administrator/i);
});
