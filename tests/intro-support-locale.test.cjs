const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');

async function fixture() {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://qa.invalid/', virtualConsole: new VirtualConsole() });
  dom.window.eval(fs.readFileSync('ha-config-auditor.js', 'utf8'));
  const card = dom.window.document.createElement('ha-config-auditor');
  const config = { title: 'Authored {title} <literal>', show_support: true };
  card.setConfig(config); dom.window.document.body.append(card);
  const requests = [];
  const hass = { language: 'en', themes: {}, states: {}, user: { id: 'qa-admin', is_admin: true },
    config: { components: [], version: '2026.9.4' },
    callWS: async message => { requests.push(message); if (message.type === 'config_entries/get') return []; throw Error('Synthetic unavailable'); },
    callApi: async () => { throw Error('Synthetic unavailable'); } };
  card.hass = hass;
  for (let i = 0; i < 50 && card._loading; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(card._loading, false);
  return { dom, card, hass, config, requests };
}

test('ordinary EN/PL-region/EN updates translate all first-run steps and dismiss labels without new audit reads', async () => {
  const f = await fixture();
  try {
    const root = f.card.shadowRoot; const reads = f.requests.length;
    root.querySelector('[data-tab="critical"]').click();
    assert.match(root.querySelector('.intro-banner').textContent, /suggested fix/);
    f.card.hass = { ...f.hass, language: 'pl-PL' };
    const intro = root.querySelector('.intro-banner');
    assert.match(intro.querySelector('.intro-headline').textContent, /konfiguracji/);
    assert.equal(intro.querySelectorAll('li').length, 3);
    for (const li of intro.querySelectorAll('li')) assert.doesNotMatch(li.textContent, /Overview|Read each|Tips tab/);
    assert.match(intro.querySelectorAll('li')[1].textContent, /wskazów/);
    assert.equal(intro.querySelector('button').getAttribute('aria-label'), 'Ukryj instrukcję');
    assert.equal(intro.querySelector('button').title, 'Ukryj instrukcję');
    assert.equal(f.card._activeTab, 'critical');
    assert.equal(f.card._config.title, f.config.title);
    f.card.hass = { ...f.hass, language: 'en' };
    assert.match(root.querySelector('.intro-banner').textContent, /suggested fix/);
    assert.equal(root.querySelector('.intro-dismiss').getAttribute('aria-label'), 'Dismiss');
    assert.equal(f.requests.length, reads);
  } finally { f.dom.window.close(); }
});

test('ordinary Polish update translates optional support text and accessible dismiss label', async () => {
  const f = await fixture();
  try {
    const reads = f.requests.length;
    f.card.hass = { ...f.hass, language: 'pl' };
    const support = f.card.shadowRoot.querySelector('.donate-section[data-source="own-card"]');
    assert.match(support.querySelector('a').textContent, /Dobrowolne wsparcie/);
    assert.equal(support.querySelector('button').getAttribute('aria-label'), 'Ukryj link wsparcia');
    assert.equal(support.querySelector('a').href, 'https://buymeacoffee.com/macsiem');
    assert.equal(support.querySelector('a').getAttribute('rel'), 'noopener noreferrer');
    f.card.hass = { ...f.hass, language: 'en' };
    assert.match(f.card.shadowRoot.querySelector('.donate-section').textContent, /Optional support/);
    assert.equal(f.requests.length, reads);
  } finally { f.dom.window.close(); }
});

test('dismissed instruction and support remain hidden through ordinary locale updates', async () => {
  const f = await fixture();
  try {
    const reads = f.requests.length;
    f.card.shadowRoot.querySelector('.intro-dismiss').click();
    f.card.shadowRoot.querySelector('.support-dismiss').click();
    for (const language of ['pl', 'en', 'pl-PL']) {
      f.card.hass = { ...f.hass, language };
      assert.equal(f.card.shadowRoot.querySelector('.intro-banner'), null);
      assert.equal(f.card.shadowRoot.querySelector('.donate-section[data-source="own-card"]'), null);
    }
    assert.equal(f.requests.length, reads);
  } finally { f.dom.window.close(); }
});

test('locale changes retain visible completed findings and the focused tab without reading again', async () => {
  const f = await fixture();
  try {
    const root = f.card.shadowRoot;
    const tab = root.querySelector('[data-tab="critical"]');
    tab.click(); tab.focus();
    const content = root.getElementById('content');
    assert.ok(content.textContent.trim().length > 0);
    const before = content.textContent;
    const reads = f.requests.length;
    for (const language of ['pl-PL', 'en']) {
      f.card.hass = { ...f.hass, language };
      assert.equal(root.getElementById('content'), content, 'locale must keep the visible result node');
      assert.equal(content.textContent, before, 'completed findings stay visible');
      assert.equal(root.activeElement, tab, 'keyboard focus remains on the same tab');
    }
    assert.equal(f.requests.length, reads);
  } finally { f.dom.window.close(); }
});
