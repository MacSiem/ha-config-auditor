const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { createUiV3 } = require('../shared/ha-tools-ui.js');
const factory = import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '../shared/ha-tools-export.js')).toString('base64'));
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

async function fixture(options = {}) {
  const { createExportDialog } = await factory;
  const dom = new JSDOM('<button id="opener">Open</button><main id="root"><p id="neighbor">Keep me</p></main><aside>Other card</aside>');
  const doc = dom.window.document, root = doc.getElementById('root');
  let context = { role: 'admin', userId: 'synthetic-user', connectionId: 'synthetic-connection', datasetId: 'synthetic-report', revision: 1, connected: true, canExport: true, sourceConfirmed: true };
  let language = options.language || 'en', now = 100;
  const timers = new Map(), builds = [], downloads = [];
  const policy = { id: 'synthetic-count-report-v1', allowlistedFields: ['count', 'missing', 'label', 'status', 'scope', 'sourceLimit'], neverInclude: ['tokens', 'users', 'addresses', 'raw_config'] };
  const payload = (draft, extra = {}) => ({ serialized: draft.format === 'json' ? '{"count":0,"missing":null,"label":"Zażółć <script>bad()</script>"}\n' : 'count,missing,label\n0,,Zażółć\n', confirmed: true, sourceConfirmed: true, status: 'success', included: ['Count, missing marker, synthetic label'], excluded: ['Tokens, users, addresses, raw configuration'], sourceLimit: 'Synthetic selected rows only', ...extra });
  const controller = createExportDialog({ root, getContext: () => context, getLanguage: () => language, createUiV3, policy, formats: options.formats || ['json', 'csv', 'txt'], defaultFormat: 'json', defaultFilename: 'report.json', clock: () => now, setTimer: (fn, ms) => { const id = Symbol(); timers.set(id, { fn, ms }); return id; }, clearTimer: id => timers.delete(id), buildPayload: args => { builds.push(args); return options.build ? options.build(args, payload) : Promise.resolve(payload(args.draft)); }, performDownload: args => { downloads.push(args); return options.download ? options.download(args) : Promise.resolve({ outcome: 'initiated' }); } });
  const find = key => root.querySelector('[data-ha-tools-export]')?.shadowRoot.querySelector(`[data-export="${key}"]`);
  const focused = () => root.querySelector('[data-ha-tools-export]')?.shadowRoot.activeElement || doc.activeElement;
  const open = async () => { doc.getElementById('opener').focus(); controller.open({ opener: doc.activeElement }); await flush(); };
  const edit = (key, value) => { const node = find(key); if (key === 'private') node.checked = value; else node.value = value; node.dispatchEvent(new dom.window.Event(key === 'filename' ? 'input' : 'change', { bubbles: true })); };
  return { dom, doc, root, controller, builds, downloads, timers, payload, find, focused, open, edit, setContext: delta => { context = { ...context, ...delta }; }, setLanguage: value => { language = value; }, advance: ms => { now += ms; }, expire: () => { for (const { fn } of [...timers.values()]) fn(); }, cleanup: () => { controller.destroy(); dom.window.close(); } };
}

test('construction is inert; open builds one private-OFF preview and never downloads', async () => {
  const f = await fixture();
  assert.equal(f.builds.length, 0); assert.equal(f.root.querySelector('[role="dialog"]'), null);
  await f.open();
  assert.equal(f.builds.length, 1); assert.equal(f.downloads.length, 0);
  assert.equal(f.find('private').checked, false); assert.equal(f.builds[0].draft.includePrivate, false);
  assert.equal(f.find('save').disabled, false); f.cleanup();
});

test('Save hands off the exact frozen preview and its UTF-8 Blob without serializing again', async () => {
  const f = await fixture(); await f.open();
  const text = f.find('preview').textContent;
  assert.equal(f.find('preview').querySelector('script'), null);
  f.find('save').click(); await flush();
  assert.equal(f.builds.length, 1); assert.equal(f.downloads.length, 1);
  const result = f.downloads[0];
  assert.equal(result.serialized, text); assert.equal(await result.blob.text(), text);
  assert.equal(result.blob.size, Buffer.byteLength(text, 'utf8'));
  assert.match(text, /"count":0/); assert.match(text, /"missing":null/);
  assert.equal(result.filename, 'report.json'); assert.equal(Object.isFrozen(result), true);
  assert.match(f.find('message').textContent, /Download initiated/);
  assert.equal(f.find('status').dataset.resultState, 'unconfirmed');
  f.find('save').click(); await flush(); assert.equal(f.downloads.length, 1); f.cleanup();
});

test('confirmed partial source can be saved with explicit inclusion and source limit', async () => {
  const f = await fixture({ build: ({ draft }, payload) => payload(draft, { status: 'partial', serialized: '{"count":2,"status":"partial","scope":"selected synthetic rows","sourceLimit":"2 of 3 synthetic rows; third unavailable"}', sourceLimit: '2 of 3 synthetic rows; third unavailable' }), download: () => ({ outcome: 'saved' }) });
  await f.open(); assert.equal(f.find('status').dataset.resultState, 'partial');
  assert.match(f.find('source-limit').textContent, /2 of 3/); assert.match(f.find('included').textContent, /Count/);
  f.find('save').click(); await flush(); assert.equal(f.downloads.length, 1);
  assert.match(f.downloads[0].serialized, /"status":"partial"/); assert.match(f.downloads[0].serialized, /sourceLimit/);
  assert.equal(f.find('status').dataset.resultState, 'success'); assert.match(f.find('message').textContent, /Save confirmed/); f.cleanup();
});

test('every draft change discards ready bytes; refresh alone regenerates', async () => {
  const f = await fixture(); await f.open();
  for (const [key, value] of [['filename', 'other.json'], ['format', 'csv'], ['private', true]]) {
    f.edit(key, value); assert.equal(f.find('save').disabled, true); assert.equal(f.find('preview').textContent, '');
  }
  assert.equal(f.builds.length, 1);
  assert.match(f.find('message').textContent, /extension/);
  f.edit('filename', 'other.csv'); f.find('refresh').click(); await flush();
  assert.equal(f.builds.length, 2); assert.equal(f.builds[1].draft.includePrivate, true);
  assert.equal(f.find('save').disabled, false); f.cleanup();
});

test('invalid filename/format produces actionable Error without default override', async () => {
  const f = await fixture(); await f.open();
  const invalid = ['', '../report.json', 'a/b.json', 'a\\b.json', 'CON.json', 'nul.txt', 'report.csv', 'bad\u0000.json', 'a'.repeat(130) + '.json', ' bad.json'];
  for (const name of invalid) {
    f.edit('filename', name); f.find('refresh').click(); await flush();
    assert.equal(f.find('filename').value, name); assert.equal(f.find('status').dataset.resultState, 'error', name);
    assert.equal(f.find('save').disabled, true); assert.ok(f.find('message').textContent.length > 15);
  }
  const option = f.doc.createElement('option'); option.value = 'yaml'; f.find('format').append(option); f.edit('format', 'yaml');
  assert.equal(f.find('format').value, 'yaml'); assert.equal(f.find('status').dataset.resultState, 'error');
  assert.equal(f.builds.length, 1); assert.equal(f.downloads.length, 0); f.cleanup();
});

test('all allowed formats require matching extension and retain exact content', async () => {
  const f = await fixture(); await f.open();
  for (const format of ['csv', 'txt', 'json']) {
    f.edit('format', format); f.edit('filename', `synthetic.${format}`); f.find('refresh').click(); await flush();
    assert.equal(f.find('save').disabled, false); const preview = f.find('preview').textContent;
    f.find('save').click(); await flush(); assert.equal(f.downloads.at(-1).serialized, preview);
  }
  assert.equal(f.downloads.length, 3); f.cleanup();
});

test('role/user/connection/dataset/revision and disconnect changes discard pending and ready bytes', async () => {
  for (const delta of [{ role: 'member' }, { userId: 'other-user' }, { connectionId: 'other-connection' }, { datasetId: 'other-report' }, { revision: 2 }, { connected: false }, { canExport: false }, { sourceConfirmed: false }]) {
    const pending = deferred(); const f = await fixture({ build: () => pending.promise });
    await f.open(); f.setContext(delta); pending.resolve(f.payload(f.builds[0].draft)); await flush();
    assert.equal(f.find('preview').textContent, ''); assert.equal(f.find('save').disabled, true); assert.equal(f.downloads.length, 0); f.cleanup();
    const g = await fixture(); await g.open(); g.setContext(delta); g.find('save').click(); await flush();
    assert.equal(g.find('preview').textContent, ''); assert.equal(g.downloads.length, 0); g.cleanup();
  }
});

test('source changed and restored still cannot resurrect private consent or canceled preview', async () => {
  const f = await fixture(); await f.open(); f.edit('private', true); f.find('refresh').click(); await flush();
  f.setContext({ revision: 2 }); f.controller.contextChanged();
  assert.equal(f.find('private').checked, false); assert.equal(f.find('preview').textContent, '');
  f.setContext({ revision: 1 }); f.controller.contextChanged(); f.find('save').click(); await flush();
  assert.equal(f.downloads.length, 0); f.find('refresh').click(); await flush();
  assert.equal(f.builds.at(-1).draft.includePrivate, false); f.cleanup();
});

test('detached consumer cannot save or accept a late preview', async () => {
  const f = await fixture(); await f.open(); f.root.remove(); f.find('save').click(); await flush();
  assert.equal(f.downloads.length, 0); assert.equal(f.find('preview').textContent, ''); f.cleanup();
  const pending = deferred(), g = await fixture({ build: () => pending.promise }); await g.open();
  g.root.remove(); pending.resolve(g.payload(g.builds[0].draft)); await flush();
  assert.equal(g.find('save').disabled, true); assert.equal(g.find('preview').textContent, ''); g.cleanup();
});

test('displayed status labels/icons use every exact W4 state through the actual factory', async () => {
  const pending = deferred(); const f = await fixture({ build: () => pending.promise }); await f.open();
  const check = code => { const expected = createUiV3({ language: 'en' }).status(code); assert.equal(f.find('status').dataset.resultState, code); assert.match(f.find('status').textContent, new RegExp(expected.label)); assert.equal(f.find('status').querySelector('[aria-hidden="true"]').textContent, expected.icon); };
  check('not_checked'); pending.resolve(f.payload(f.builds[0].draft)); await flush(); check('success');
  f.edit('filename', '../bad.json'); check('error'); f.cleanup();
  for (const [extra, code] of [[{ status: 'partial' }, 'partial'], [{ status: 'unconfirmed' }, 'unconfirmed'], [{ status: 'no_data' }, 'no_data']]) {
    const g = await fixture({ build: ({ draft }, payload) => payload(draft, extra) }); await g.open();
    const expected = createUiV3({ language: 'en' }).status(code); assert.equal(g.find('status').dataset.resultState, code); assert.match(g.find('status').textContent, new RegExp(expected.label)); assert.equal(g.find('status').querySelector('[aria-hidden="true"]').textContent, expected.icon); g.cleanup();
  }
});

test('cancel aborts pending builder, suppresses late result and returns exact opener focus', async () => {
  const pending = deferred(); const f = await fixture({ build: () => pending.promise }); await f.open();
  const signal = f.builds[0].signal; f.find('cancel').click();
  assert.equal(signal.aborted, true); assert.equal(f.timers.size, 0); assert.equal(f.root.querySelector('[data-ha-tools-export]'), null);
  assert.equal(f.doc.activeElement, f.doc.getElementById('opener'));
  pending.resolve(f.payload(f.builds[0].draft)); await flush(); assert.equal(f.downloads.length, 0); f.cleanup();
});

test('10-second deadline aborts and suppresses late preview including delayed timer delivery', async () => {
  for (const fireTimer of [true, false]) {
    const pending = deferred(); const f = await fixture({ build: () => pending.promise }); await f.open();
    assert.equal([...f.timers.values()][0].ms, 10000); f.advance(10001);
    if (fireTimer) f.expire(); pending.resolve(f.payload(f.builds[0].draft)); await flush();
    assert.equal(f.builds[0].signal.aborted, true); assert.equal(f.find('status').dataset.resultState, 'unconfirmed');
    assert.equal(f.find('preview').textContent, ''); assert.equal(f.timers.size, 0); assert.equal(f.downloads.length, 0); f.cleanup();
  }
});

test('duplicate open/refresh and double Save coalesce; unconfirmed write needs new intent', async () => {
  const pending = deferred(), handoff = deferred();
  const f = await fixture({ build: () => pending.promise, download: () => handoff.promise });
  await f.open(); f.controller.open(); f.find('refresh').click(); f.find('refresh').click();
  assert.equal(f.builds.length, 1); pending.resolve(f.payload(f.builds[0].draft)); await flush();
  f.find('save').click(); f.find('save').click(); assert.equal(f.downloads.length, 1);
  f.find('refresh').click(); assert.equal(f.builds.length, 1);
  handoff.resolve({ outcome: 'unknown' }); await flush(); f.find('save').click(); assert.equal(f.downloads.length, 1);
  assert.equal(f.find('status').dataset.resultState, 'unconfirmed');
  f.find('refresh').click(); await flush(); assert.equal(f.builds.length, 2); f.cleanup();
});

test('draft edit aborts pending builder; old bytes cannot replace refreshed preview', async () => {
  const first = deferred(), second = deferred();
  const f = await fixture({ build: () => f.builds.length === 1 ? first.promise : second.promise });
  await f.open(); f.edit('filename', 'new.json'); assert.equal(f.builds[0].signal.aborted, true);
  f.find('refresh').click(); await flush(); second.resolve(f.payload(f.builds[1].draft, { serialized: '{"count":2}' })); await flush();
  first.resolve(f.payload(f.builds[0].draft, { serialized: '{"count":1}' })); await flush();
  assert.equal(f.find('preview').textContent, '{"count":2}'); f.cleanup();
});

test('cancel/reopen during a pending handoff cannot repeat it or apply its late success', async () => {
  const result = deferred(), f = await fixture({ download: () => result.promise }); await f.open();
  f.find('save').click(); await flush(); f.controller.cancel(); await f.open();
  assert.equal(f.builds.length, 1); assert.equal(f.find('refresh').disabled, true); assert.equal(f.downloads.length, 1);
  result.resolve({ outcome: 'saved' }); await flush();
  assert.equal(f.find('status').dataset.resultState, 'unconfirmed'); assert.equal(f.find('preview').textContent, '');
  assert.equal(f.find('refresh').disabled, false); assert.equal(f.find('save').disabled, true);
  assert.equal(f.find('private').checked, false); f.cleanup();
});

test('serialized string is captured once, so a getter cannot diverge preview and Blob', async () => {
  let reads = 0;
  const f = await fixture({ build: ({ draft }, payload) => {
    const result = payload(draft); Object.defineProperty(result, 'serialized', { get: () => { reads++; return reads === 1 ? '{"count":0}' : '{"count":99}'; } }); return result;
  } });
  await f.open(); f.find('save').click(); await flush();
  assert.equal(reads, 1); assert.equal(f.downloads[0].serialized, '{"count":0}');
  assert.equal(await f.downloads[0].blob.text(), '{"count":0}'); f.cleanup();
});

test('unconfirmed/unavailable payloads and incomplete consumer metadata never enable Save', async () => {
  for (const extra of [{ confirmed: false }, { sourceConfirmed: false }, { serialized: null }, { serialized: '' }, { status: 'unconfirmed' }, { status: 'no_data' }, { included: [] }, { excluded: [] }, { sourceLimit: '' }]) {
    const f = await fixture({ build: ({ draft }, payload) => payload(draft, extra) }); await f.open();
    assert.equal(f.find('save').disabled, true); assert.equal(f.find('preview').textContent, ''); assert.equal(f.downloads.length, 0); f.cleanup();
  }
});

test('builder error and adapter rejection show localized generic messages without leaking errors', async () => {
  const f = await fixture({ build: () => { throw new Error('synthetic secret detail'); } }); await f.open();
  assert.equal(f.find('status').dataset.resultState, 'error'); assert.doesNotMatch(f.root.textContent, /secret detail/); f.cleanup();
  const g = await fixture({ download: () => Promise.reject(new Error('synthetic secret detail')) }); await g.open();
  g.find('save').click(); await flush(); assert.equal(g.find('status').dataset.resultState, 'unconfirmed');
  assert.doesNotMatch(g.root.textContent, /secret detail/); assert.equal(g.find('save').disabled, true); g.cleanup();
});

test('PL/EN, W4 icons, focus trap/Escape and private-OFF every reopening', async () => {
  const f = await fixture({ language: 'pl' }); await f.open();
  assert.equal(f.find('title').textContent, 'Eksport'); assert.match(f.find('status').textContent, /Sukces/);
  assert.equal(f.find('status').querySelector('[aria-hidden="true"]').textContent, createUiV3({ language: 'pl' }).status('success').icon);
  assert.equal(f.focused(), f.find('filename'));
  f.find('cancel').focus(); f.find('cancel').dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true }));
  assert.equal(f.focused(), f.find('filename'));
  f.find('filename').dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, composed: true, cancelable: true }));
  assert.equal(f.focused(), f.find('cancel'));
  f.edit('private', true); f.find('cancel').dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  assert.equal(f.doc.activeElement, f.doc.getElementById('opener'));
  f.setLanguage('en'); await f.open(); assert.equal(f.find('private').checked, false); assert.equal(f.find('title').textContent, 'Export'); f.cleanup();
});

test('isolated container preserves adjacent nodes and destroy removes timers/listeners', async () => {
  const f = await fixture(); const neighbor = f.doc.getElementById('neighbor'), aside = f.doc.querySelector('aside'); await f.open();
  assert.equal(f.doc.getElementById('neighbor'), neighbor); assert.equal(f.doc.querySelector('aside'), aside);
  f.controller.destroy(); assert.equal(f.root.childNodes.length, 1); assert.equal(f.root.firstChild, neighbor); assert.equal(f.timers.size, 0);
  assert.throws(() => f.controller.open(), /destroyed/); f.dom.window.close();
});

test('pure factory requires explicit consumer allowlist and existing W4 helper', async () => {
  const { createExportDialog } = await factory; const dom = new JSDOM('<main></main>'); const root = dom.window.document.querySelector('main');
  const common = { root, getContext: () => ({}), getLanguage: () => 'en', buildPayload: () => ({}), performDownload: () => ({}) };
  assert.throws(() => createExportDialog(common), /policy|createUiV3/);
  assert.equal(root.children.length, 0); dom.window.close();
});

// Existing Data Exporter offers YAML: shared presentation must preserve it.
test('explicit YAML consumer preserves its existing format and exact bytes', async () => {
  const f = await fixture({ formats: ['json', 'yaml'], build: () => ({serialized: 'count: 0\nmissing: null\n', confirmed:true, sourceConfirmed:true, status:'success',included:['Count'],excluded:['Private fields'],sourceLimit:'Synthetic known fields'}) });
  await f.open();f.edit('format','yaml');f.edit('filename','report.yaml');f.find('refresh').click();await flush();
  assert.equal(f.find('save').disabled,false);f.find('save').click();await flush();
  assert.equal(f.downloads[0].format,'yaml');assert.equal(f.downloads[0].blob.type,'application/yaml;charset=utf-8');
  assert.equal(await f.downloads[0].blob.text(),'count: 0\nmissing: null\n');f.cleanup();
});

test('valid basename can contain repeated dots without being a path', async () => {
  const f = await fixture();await f.open();f.edit('filename','report..2026.json');f.find('refresh').click();await flush();
  assert.equal(f.find('save').disabled,false);f.find('save').click();await flush();
  assert.equal(f.downloads[0].filename,'report..2026.json');f.cleanup();
});
