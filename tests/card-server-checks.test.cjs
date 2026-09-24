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

function hass(server) {
  return {
    states: {}, language: 'en', themes: { darkMode: false },
    user: { is_admin: true }, config: { components: [], external_url: null, version: '2026.9.3' },
    callWS: async (msg) => {
      if (msg.type === 'ha_config_auditor/audit') {
        if (server) return server;
        const err = new Error('Unknown command.'); err.code = 'unknown_command'; throw err;
      }
      if (msg.type === 'config/auth/list') return [{ name: 'Admin', is_owner: true, is_active: true }];
      if (msg.type === 'config_entries/get') return [];
      throw new Error('not supported');
    },
    callApi: async () => { throw new Error('not supported'); },
    callService: async () => ({}),
    connection: { subscribeEvents: async () => () => {}, subscribeMessage: async () => () => {} },
  };
}

async function audit(server) {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom.window;
  w.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  w.eval(CARD);
  const card = w.document.createElement('ha-config-auditor');
  card.setConfig({ type: 'custom:ha-config-auditor' });
  w.document.body.appendChild(card);
  card.hass = hass(server);
  for (let i = 0; i < 50 && (card._loading || !card._auditData); i++) await delay(20);
  const data = card._auditData;
  const html = card.shadowRoot.innerHTML;
  const findingsHtml = card._renderFindings(data);
  w.close();
  return { data, html, findingsHtml };
}

const ids = (list) => list.map((f) => f.id);

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
