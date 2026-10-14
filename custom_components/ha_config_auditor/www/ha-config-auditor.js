/* HA Tools split — ha-config-auditor v6.1.0 (2026-10-14) — single-tool standalone repo */
(function() {
'use strict';

// BEGIN HA TOOLS UI V3 source-sha256=029c06206e55abad9aa09dfcf65bb13027ec24ce6a0bfacc45a938891b27254e
// HA Tools v3: vendored inside each consumer's own closure, never a window API.
function createUiV3({ language = 'en' } = {}) {
  const pl = String(language).startsWith('pl');
  const states = {
    success: ['Success', 'Sukces', '✓'],
    partial: ['Partial', 'Częściowo', '½'],
    unconfirmed: ['Unconfirmed', 'Niepotwierdzony', '?'],
    error: ['Error', 'Błąd', '✕'],
    not_checked: ['Not checked', 'Nie sprawdzono', '–'],
    no_data: ['No data', 'Brak danych', '∅'],
  };
  const status = (value) => {
    const code = typeof value === 'string' && Object.hasOwn(states, value) ? value : 'not_checked';
    const row = states[code];
    return { code, label: row[pl ? 1 : 0], icon: row[2], countsAsSuccess: code === 'success' };
  };
  const statusHtml = (value) => {
    const result = status(value);
    return `<span class="ht-result-state ht-result-state--${result.code}" data-result-state="${result.code}"><span aria-hidden="true">${result.icon}</span> ${result.label}</span>`;
  };
  const css = `
.ht-result-state { display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid currentColor;border-radius:6px;font-size:12px;line-height:1.4;white-space:normal; }
.ht-result-state--success { color:#237b3d;background:rgba(35,123,61,.10); }
.ht-result-state--partial { color:#966400;background:rgba(150,100,0,.10); }
.ht-result-state--unconfirmed { color:#ad5200;background:rgba(173,82,0,.10); }
.ht-result-state--error { color:#c32b2b;background:rgba(195,43,43,.10); }
.ht-result-state--not_checked,.ht-result-state--no_data { color:var(--secondary-text-color,#666);background:transparent; }
.ht-result-state--no_data { border-style:dashed; }
:host(.bento-dark) .ht-result-state--success { color:#81cf99; }
:host(.bento-dark) .ht-result-state--partial { color:#efd080; }
:host(.bento-dark) .ht-result-state--unconfirmed { color:#ffb97b; }
:host(.bento-dark) .ht-result-state--error { color:#ff9999; }
`;
  return { status, statusHtml, css };
}
// END HA TOOLS UI V3

// BEGIN HA TOOLS EXPORT V3 source-sha256=bae4197cb254a7e24affbf90f029833127c5ba09b5b96f876a6fd8112f816a3d
/**
 * W6 export dialog. Pure ES module; vendor this factory INSIDE each consumer's
 * own IIFE (remove only the `export` keyword). Never attach it to window.
 * Construction is inert. open() appends only its own container to root.
 *
 * Required dependency injection:
 * root: Element/ShadowRoot; getLanguage(): 'pl'|'en'; createUiV3: existing W4 factory.
 * getContext(): {role,userId,connectionId,datasetId,revision,connected,canExport,
 *                sourceConfirmed}. Identities/revision are nonempty scalar values;
 * bump revision monotonically for source/filter/selection/identity changes,
 * including a restored source; never reuse an old revision. Never return tokens or data.
 * policy: {id,allowlistedFields:string[],neverInclude:[tokens,users,addresses,raw_config]}.
 * formats: explicit subset of ['json','csv','txt']; defaults must be explicit valid choices.
 * buildPayload({context,draft,policy,signal}): read-only, Promise or sync result:
 * {serialized:string,confirmed:true,sourceConfirmed:true,status:'success'|'partial',
 *  included:string[],excluded:string[],sourceLimit:string}.
 * Included/Excluded/sourceLimit describe the REVIEWED CONSUMER policy and actual
 * source limitations in the current language. The consumer MUST explicitly select
 * allowed fields, exclude tokens/users/addresses/raw configuration under EVERY
 * private opt-in, and sanitize CSV formula cells where applicable. A generic
 * recursive export/redactor of arbitrary raw state/config is NOT a valid consumer.
 * This factory cannot inspect or truthfully sanitize an unknown arbitrary schema.
 * For partial reports the consumer also encodes the partial status, inclusion
 * scope and source limitations IN its allowlisted file schema, not only UI text.
 * performDownload({serialized,blob,filename,format,context,signal}): explicit Save
 * only. Return {outcome:'initiated'|'saved'|'unknown'}; 'saved' requires actual
 * adapter confirmation, never infer disk persistence from an anchor click.
 * Optional clock(): monotonic milliseconds; setTimer(fn,ms), clearTimer(handle).
 *
 * Returned API: open({opener}), cancel(), contextChanged(), destroy(). Every open
 * resets private consent. contextChanged() discards bytes/consent immediately;
 * owner also calls cancel/destroy on disconnect. Save ALWAYS rechecks context.
 * One preview on open, explicit Refresh thereafter; bounded 10s, no automatic
 * retries/downloads/persistence. AbortSignal is advisory; late results are ignored.
 */
function createExportDialog(options) {
  const { root, getContext, getLanguage, createUiV3, buildPayload, performDownload,
    clock = () => globalThis.performance.now(), setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimer = id => globalThis.clearTimeout(id), defaultFormat, defaultFilename } = options || {};
  const allowedFormats = ['json', 'csv', 'txt', 'yaml'];
  const excludedCategories = ['tokens', 'users', 'addresses', 'raw_config'];
  const strings = value => Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'string' && v.trim());
  if (!root?.append || !root.ownerDocument || [getContext, getLanguage, createUiV3, buildPayload, performDownload, clock, setTimer, clearTimer].some(fn => typeof fn !== 'function')) {
    throw new TypeError('root and injected getContext/getLanguage/createUiV3/buildPayload/performDownload/clock/timers are required');
  }
  const suppliedPolicy = options.policy;
  if (!suppliedPolicy || typeof suppliedPolicy.id !== 'string' || !suppliedPolicy.id.trim() || !strings(suppliedPolicy.allowlistedFields) || !strings(suppliedPolicy.neverInclude) || excludedCategories.some(key => !suppliedPolicy.neverInclude.includes(key))) {
    throw new TypeError('Explicit reviewed consumer policy with allowlistedFields and neverInclude is required');
  }
  const policy = Object.freeze({ id: suppliedPolicy.id, allowlistedFields: Object.freeze([...suppliedPolicy.allowlistedFields]), neverInclude: Object.freeze([...suppliedPolicy.neverInclude]) });
  if (!strings(options.formats) || options.formats.some(f => !allowedFormats.includes(f)) || new Set(options.formats).size !== options.formats.length || !options.formats.includes(defaultFormat) || typeof defaultFilename !== 'string') {
    throw new TypeError('Explicit formats/defaultFormat/defaultFilename are required');
  }
  const formats = Object.freeze([...options.formats]);
  const doc = root.ownerDocument;
  const mime = { json: 'application/json;charset=utf-8', csv: 'text/csv;charset=utf-8', txt: 'text/plain;charset=utf-8', yaml: 'application/yaml;charset=utf-8' };
  const copy = {
    en: { title: 'Export', filename: 'Filename', format: 'Format', private: 'Include reviewed private fields (this export only)', included: 'Included in the file', excluded: 'Excluded from the file', source: 'Source and limits', preview: 'Exact file content', save: 'Save', refresh: 'Refresh preview', cancel: 'Cancel', busy: 'Building preview… Save waits for confirmed bytes.', changed: 'Choices changed. Refresh preview before Save.', context: 'Source or access changed. Review the source and refresh preview.', unavailable: 'Source unavailable or unconfirmed. Reconnect or confirm the source, then refresh.', invalidFormat: 'Choose an allowed format: JSON, CSV, TXT or YAML as offered.', invalidName: 'Use a basename of 1–128 characters: no paths, control characters, reserved names or leading/trailing spaces.', extension: 'Filename must end with the selected extension. Edit the filename, then refresh.', timeout: 'Preview exceeded 10 seconds. Check the source and explicitly refresh.', buildError: 'Could not build a confirmed preview. Check the source and refresh.', unconfirmed: 'Bytes or source metadata are unconfirmed. Confirm the source and refresh.', noData: 'No confirmed file content. Select available data and refresh.', saving: 'Handing off the confirmed preview… Wait for the adapter result.', initiated: 'Download initiated. Saving to the filesystem is not confirmed. Refresh only for a new export intent.', saved: 'Save confirmed by the download adapter.', unknown: 'Download result unconfirmed. Check the previous attempt before explicitly refreshing for a new export intent.' },
    pl: { title: 'Eksport', filename: 'Nazwa pliku', format: 'Format', private: 'Dołącz sprawdzone pola prywatne (tylko ten eksport)', included: 'W pliku jest', excluded: 'W pliku nie ma', source: 'Źródło i ograniczenia', preview: 'Dokładna zawartość pliku', save: 'Zapisz', refresh: 'Odśwież podgląd', cancel: 'Anuluj', busy: 'Przygotowywanie podglądu… Zapis wymaga potwierdzonej zawartości.', changed: 'Wybór zmieniony. Odśwież podgląd przed zapisem.', context: 'Źródło lub uprawnienia zmienione. Sprawdź źródło i odśwież podgląd.', unavailable: 'Źródło niedostępne lub niepotwierdzone. Połącz lub potwierdź źródło i odśwież.', invalidFormat: 'Wybierz dostępny format: JSON, CSV, TXT lub YAML z listy.', invalidName: 'Użyj nazwy pliku o długości 1–128 znaków: bez ścieżek, znaków sterujących, nazw zastrzeżonych i skrajnych spacji.', extension: 'Nazwa pliku musi mieć rozszerzenie wybranego formatu. Popraw nazwę i odśwież.', timeout: 'Podgląd przekroczył 10 sekund. Sprawdź źródło i jawnie odśwież.', buildError: 'Nie udało się przygotować potwierdzonego podglądu. Sprawdź źródło i odśwież.', unconfirmed: 'Zawartość lub opis źródła niepotwierdzony. Potwierdź źródło i odśwież.', noData: 'Brak potwierdzonej zawartości pliku. Wybierz dostępne dane i odśwież.', saving: 'Przekazywanie potwierdzonego podglądu… Poczekaj na wynik zapisu.', initiated: 'Pobieranie rozpoczęte. Zapis na dysku nie jest potwierdzony. Odśwież tylko dla nowej próby eksportu.', saved: 'Adapter pobierania potwierdził zapis.', unknown: 'Wynik pobierania niepotwierdzony. Sprawdź poprzednią próbę przed jawnym odświeżeniem dla nowego eksportu.' },
  };
  const css = `
[data-ha-tools-export] { min-width:0;max-width:100%;color:var(--primary-text-color,#1e293b);font:inherit; }
[data-ha-tools-export] * { box-sizing:border-box; }
[data-ha-tools-export] dialog { width:min(520px,calc(100vw - 32px));max-width:none;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);min-width:0;margin:auto;padding:0;border:1px solid var(--divider-color,#e2e8f0);border-radius:18px;background:var(--card-background-color,#fff);color:inherit;font:inherit;box-shadow:0 24px 64px #0f172a33;overflow:hidden; }
[data-ha-tools-export] dialog[open] { display:flex;flex-direction:column; }
[data-ha-tools-export] dialog::backdrop { background:#0f172a66; }
[data-ha-tools-export] .ht-export-body { min-height:0;overflow:auto;overscroll-behavior:contain;padding:24px; }
[data-ha-tools-export] h2,[data-ha-tools-export] h3,[data-ha-tools-export] p,[data-ha-tools-export] li { overflow-wrap:anywhere;white-space:normal; }
[data-ha-tools-export] h2 { margin:0 0 16px;font-size:1.25em;line-height:1.4; }
[data-ha-tools-export] h3 { margin:16px 0 6px;font-size:1em;line-height:1.5; }
[data-ha-tools-export] p { line-height:1.5; }
[data-ha-tools-export] .ht-export-fields { display:grid;grid-template-columns:minmax(0,1fr);gap:12px; }
[data-ha-tools-export] label { display:flex;flex-direction:column;gap:6px;min-width:0;overflow-wrap:anywhere; }
[data-ha-tools-export] .ht-export-format { margin-top:16px; }
[data-ha-tools-export] .ht-export-private { flex-direction:row;align-items:center;min-height:44px;margin-top:12px; }
[data-ha-tools-export] input:not([type=checkbox]),[data-ha-tools-export] select,[data-ha-tools-export] button { font:inherit;min-width:44px;min-height:44px;max-width:100%; }
[data-ha-tools-export] input:not([type=checkbox]),[data-ha-tools-export] select { width:100%;color:inherit;background:var(--ht-export-field-bg,#f8fafc);border:1px solid var(--divider-color,#cbd5e1);border-radius:8px;padding:8px 12px; }
[data-ha-tools-export] input[type=checkbox] { width:24px;height:24px;flex:none;margin:10px; }
[data-ha-tools-export] [data-export-scope] { padding:12px 14px;border-radius:10px;margin-top:14px; }
[data-ha-tools-export] [data-export-scope] h3 { margin:0 0 6px; }
[data-ha-tools-export] [data-export-scope=included] { background:var(--ht-export-included-bg,#ecfdf3);color:var(--ht-export-included-text,#166534); }
[data-ha-tools-export] [data-export-scope=excluded] { background:var(--ht-export-excluded-bg,#fff1f2);color:var(--ht-export-excluded-text,#9f1239); }
[data-ha-tools-export] ul { padding:0;margin:0;list-style:none; }
[data-ha-tools-export] li { display:flex;gap:6px;line-height:1.5; }
[data-ha-tools-export] li + li { margin-top:4px; }
[data-ha-tools-export] [data-export-scope=included] li::before { content:'✓';flex:none; }
[data-ha-tools-export] [data-export-scope=excluded] li::before { content:'×';flex:none; }
[data-ha-tools-export] button { padding:8px 12px;white-space:normal;overflow-wrap:anywhere;cursor:pointer;border:1px solid transparent;border-radius:8px;color:var(--ht-export-accent,#0369a1);background:transparent; }
[data-ha-tools-export] [data-export=save] { color:var(--ht-export-save-text,#fff);background:var(--ht-export-accent,#0369a1); }
[data-ha-tools-export] :focus-visible { outline:3px solid var(--ht-export-accent,#0369a1);outline-offset:2px; }
[data-ha-tools-export] button:disabled { cursor:default;opacity:.6; }
[data-ha-tools-export] .ht-export-actions { display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;flex:none;padding:12px 24px;border-top:1px solid var(--divider-color,#e2e8f0);background:var(--card-background-color,#fff); }
[data-ha-tools-export] pre { max-width:100%;min-width:0;max-height:260px;overflow:auto;white-space:pre;margin:0;padding:12px;border:1px solid var(--divider-color,#cbd5e1);border-radius:8px;background:var(--ht-export-field-bg,#f8fafc); }
:host(.bento-dark) { --ht-export-field-bg:#0f172a;--ht-export-included-bg:#103827;--ht-export-included-text:#bbf7d0;--ht-export-excluded-bg:#43212a;--ht-export-excluded-text:#fda4af;--ht-export-accent:#7dd3fc;--ht-export-save-text:#0f172a; }
@media (max-width:399px) { [data-ha-tools-export] .ht-export-body { padding:16px; } [data-ha-tools-export] .ht-export-actions { padding:12px 16px;gap:6px; } }
@media (max-width:319px) { [data-ha-tools-export] dialog { width:calc(100vw - 16px); } [data-ha-tools-export] .ht-export-actions button { flex:1 1 auto; } }
`;  let container, nodes, L, ui, opener, alive = false, destroyed = false, serial = 0;
  let pending = null, handoff = null, ready = null, observed = null;
  const listeners = [];
  const on = (target, event, handler, capture = false) => {
    target.addEventListener(event, handler, capture);
    listeners.push(() => target.removeEventListener(event, handler, capture));
  };
  const contextKeys = ['role', 'userId', 'connectionId', 'datasetId', 'revision'];
  function readContext() {
    try {
      const value = getContext();
      if (!value || contextKeys.some(k => !['string', 'number'].includes(typeof value[k]) || String(value[k]).trim() === '' || (typeof value[k] === 'number' && !Number.isFinite(value[k])))) return null;
      return Object.freeze(Object.fromEntries([...contextKeys, 'connected', 'canExport', 'sourceConfirmed'].map(k => [k, value[k]])));
    } catch { return null; }
  }
  const same = (a, b) => !!a && !!b && [...contextKeys, 'connected', 'canExport', 'sourceConfirmed'].every(k => a[k] === b[k]);
  const available = c => !!c && c.connected === true && c.canExport === true && c.sourceConfirmed === true;
  const draft = () => Object.freeze({ filename: nodes.filename.value, format: nodes.format.value, includePrivate: nodes.private.checked });
  const sameDraft = (a, b) => a.filename === b.filename && a.format === b.format && a.includePrivate === b.includePrivate;
  function validation(value) {
    if (!formats.includes(value.format)) return 'invalidFormat';
    const name = value.filename;
    if (!name || [...name].length > 128 || name !== name.trim() || /[\p{Cc}\p{Cf}/\\<>:"|?*]/u.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(name)) return 'invalidName';
    if (!name.endsWith(`.${value.format}`) || name.length <= value.format.length + 1) return 'extension';
    return null;
  }
  function status(code, message) {
    if (!alive) return;
    const result = ui.status(code); // exact existing W4 labels/icons/codes
    nodes.status.className = `ht-result-state ht-result-state--${result.code}`;
    nodes.status.dataset.resultState = result.code;
    nodes.status.replaceChildren();
    const icon = doc.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = result.icon;
    nodes.status.append(icon, doc.createTextNode(` ${result.label}`));
    nodes.message.textContent = ` ${L[message]}`;
    nodes.save.disabled = !ready || !!pending || !!handoff;
    nodes.refresh.disabled = !!pending || !!handoff;
  }
  function stop(job) {
    if (!job) return;
    if (job.timer !== null) clearTimer(job.timer);
    job.timer = null; job.controller.abort();
  }
  function discard(resetPrivate = false) {
    serial++; stop(pending); pending = null; ready = null;
    if (alive) {
      nodes.preview.textContent = ''; nodes.included.replaceChildren(); nodes.excluded.replaceChildren(); nodes['source-limit'].textContent = '';
      if (resetPrivate) nodes.private.checked = false;
    }
  }
  function contextChanged() {
    if (!alive) return;
    observed = readContext(); discard(true);
    // Once a handoff began we cannot retract a browser download. Ignore its late
    // callback and retain the prohibition on a second write until it settles.
    if (handoff) handoff.controller.abort();
    status(root.isConnected && available(observed) ? 'unconfirmed' : 'no_data', 'context');
  }
  function validContext(original) {
    const current = readContext();
    if (!root.isConnected || !same(original, current) || !available(current)) { contextChanged(); return false; }
    return true;
  }
  function changeDraft() {
    if (!alive) return;
    if (!same(observed, readContext())) { contextChanged(); return; }
    discard();
    const error = validation(draft()); status(error ? 'error' : 'not_checked', error || 'changed');
  }
  function fillList(node, items) {
    node.replaceChildren(...items.map(text => { const li = doc.createElement('li'); li.textContent = text; return li; }));
  }
  async function refresh() {
    if (!alive || pending || handoff) return;
    const current = readContext();
    if (!same(observed, current)) { observed = current; discard(true); }
    const value = draft(), error = validation(value);
    discard();
    if (error) { status('error', error); return; }
    if (!root.isConnected || !available(current)) { status(!root.isConnected || current?.connected === false ? 'no_data' : 'unconfirmed', 'unavailable'); return; }
    observed = current;
    const job = { id: serial, context: current, draft: value, started: clock(), controller: new globalThis.AbortController(), timer: null };
    pending = job; status('not_checked', 'busy');
    const timeout = () => {
      if (!alive || pending !== job) return;
      discard(); status('unconfirmed', 'timeout');
    };
    job.timer = setTimer(timeout, 10000);
    try {
      const payload = await buildPayload(Object.freeze({ context: current, draft: value, policy, signal: job.controller.signal }));
      if (!alive || pending !== job || job.id !== serial) return;
      if (clock() - job.started >= 10000) { timeout(); return; }
      if (!validContext(current)) return;
      clearTimer(job.timer); job.timer = null;
      if (!sameDraft(value, draft())) { changeDraft(); return; }
      const { serialized, confirmed, sourceConfirmed, status: resultState, included, excluded, sourceLimit } = payload || {};
      if (resultState === 'no_data' || serialized === '') { pending = null; status('no_data', 'noData'); return; }
      if (confirmed !== true || sourceConfirmed !== true || !['success', 'partial'].includes(resultState) || typeof serialized !== 'string' || !strings(included) || !strings(excluded) || typeof sourceLimit !== 'string' || !sourceLimit.trim()) {
        pending = null; status('unconfirmed', 'unconfirmed'); return;
      }
      // Freeze the only serialized bytes and build the only Blob NOW; Save never
      // re-runs serialization or builds a second payload from potentially newer data.
      ready = Object.freeze({ serialized, blob: new globalThis.Blob([serialized], { type: mime[value.format] }), context: current, draft: value });
      nodes.preview.textContent = ready.serialized;
      fillList(nodes.included, [...included]); fillList(nodes.excluded, [...excluded]);
      nodes['source-limit'].textContent = sourceLimit;
      pending = null; status(resultState, 'changed'); nodes.message.textContent = '';
    } catch {
      if (!alive || pending !== job || job.id !== serial) return;
      if (clock() - job.started >= 10000) { timeout(); return; }
      if (!validContext(current)) return;
      discard(); status('error', 'buildError');
    }
  }
  async function save() {
    if (!alive || !ready || pending || handoff) return;
    if (!validContext(ready.context)) return;
    const value = draft(), error = validation(value);
    if (error || !sameDraft(value, ready.draft) || nodes.preview.textContent !== ready.serialized) {
      discard(); status(error ? 'error' : 'unconfirmed', error || 'changed'); return;
    }
    const snapshot = ready; ready = null; // consume intent BEFORE invoking adapter
    const job = { id: serial, context: snapshot.context, controller: new globalThis.AbortController() };
    handoff = job; status('unconfirmed', 'saving');
    // choices cannot initiate another preview while the adapter result is unknown
    for (const key of ['filename', 'format', 'private']) nodes[key].disabled = true;
    try {
      const result = await performDownload(Object.freeze({ serialized: snapshot.serialized, blob: snapshot.blob, filename: snapshot.draft.filename, format: snapshot.draft.format, context: snapshot.context, signal: job.controller.signal }));
      if (!alive || handoff !== job || job.id !== serial || !validContext(job.context)) return;
      status(result?.outcome === 'saved' ? 'success' : 'unconfirmed', result?.outcome === 'saved' ? 'saved' : result?.outcome === 'initiated' ? 'initiated' : 'unknown');
    } catch {
      if (alive && handoff === job && job.id === serial && validContext(job.context)) status('unconfirmed', 'unknown');
    } finally {
      if (handoff === job) {
        handoff = null;
        if (alive) {
          for (const key of ['filename', 'format', 'private']) nodes[key].disabled = false;
          nodes.refresh.disabled = false; nodes.save.disabled = true;
          if (job.id !== serial) status('unconfirmed', 'unknown');
        }
      }
    }
  }
  function focusable() {
    return Array.from(nodes.dialog.querySelectorAll('input,select,button,[tabindex="0"]')).filter(el => !el.disabled);
  }
  function keydown(event) {
    if (!alive) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
    if (event.key === 'Tab') {
      const items = focusable(), first = items[0], last = items.at(-1);
      const active = nodes.dialog.getRootNode().activeElement || root.activeElement || doc.activeElement;
      if (event.shiftKey && (active === first || !nodes.dialog.contains(active))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (active === last || !nodes.dialog.contains(active))) { event.preventDefault(); first?.focus(); }
    }
  }
  function cancel() {
    if (!alive) return;
    discard(true); if (handoff) handoff.controller.abort();
    alive = false; listeners.splice(0).forEach(off => off());
    if (nodes.dialog.open) nodes.dialog.close();
    container.remove();
    container = null; nodes = null; observed = null;
    // A pending handoff remains latched until settled: reopening never repeats it.
    if (opener?.isConnected && typeof opener.focus === 'function') opener.focus();
    opener = null;
  }
  function open({ opener: target } = {}) {
    if (destroyed) throw new Error('Export dialog destroyed');
    if (alive) return;
    const language = String(getLanguage());
    L = copy[language.startsWith('pl') ? 'pl' : 'en'];
    ui = createUiV3({ language });
    opener = target || root.activeElement || doc.activeElement;
    container = doc.createElement('div'); container.setAttribute('data-ha-tools-export', '');
    // The own shadow boundary contains CSS and local IDs; adjacent W4 status
    // elements retain their existing styling. Consumers can query this open root.
    const shadow = container.attachShadow({ mode: 'open' });
    if (root.host?.classList.contains('bento-dark')) container.classList.add('bento-dark');
    const style = doc.createElement('style'); style.textContent = ':host{display:block;min-width:0;max-width:100%;}' + css + '\n' + ui.css;
    shadow.append(style);
    const shell = doc.createElement('div'); shell.setAttribute('data-ha-tools-export', ''); shadow.append(shell);
    nodes = {};
    const make = (tag, key, parent, text) => { const node = doc.createElement(tag); if (key) { node.dataset.export = key; nodes[key] = node; } if (text) node.textContent = text; parent.append(node); return node; };
    const dialog = make('dialog', 'dialog', shell); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    const body = make('div', null, dialog); body.className = 'ht-export-body';
    const title = make('h2', 'title', body, L.title);
    // Locally unique IDs, no random or global counters/persistent state.
    const prefix = `ht-export-${String(clock()).replace(/\W/g, '')}`;
    title.id = prefix + '-title'; dialog.setAttribute('aria-labelledby', title.id);
    const fields = make('div', null, body); fields.className = 'ht-export-fields';
    const filenameLabel = make('label', null, fields); make('span', null, filenameLabel, L.filename);
    const filename = make('input', 'filename', filenameLabel); filename.type = 'text'; filename.value = defaultFilename; filename.autocomplete = 'off';
    for (const key of ['included', 'excluded']) {
      const scope = make('section', null, body); scope.dataset.exportScope = key;
      make('h3', null, scope, L[key]); make('ul', key, scope);
    }
    const formatLabel = make('label', null, body); formatLabel.className = 'ht-export-format'; make('span', null, formatLabel, L.format);
    const format = make('select', 'format', formatLabel);
    formats.forEach(value => { const option = make('option', null, format, value.toUpperCase()); option.value = value; }); format.value = defaultFormat;
    const privateLabel = make('label', null, body); privateLabel.className = 'ht-export-private';
    const privateInput = make('input', 'private', privateLabel); privateInput.type = 'checkbox'; privateInput.checked = false; make('span', null, privateLabel, L.private);
    const statusLine = make('p', null, body); statusLine.setAttribute('role', 'status'); statusLine.setAttribute('aria-live', 'polite');
    make('span', 'status', statusLine); make('span', 'message', statusLine);
    make('h3', null, body, L.source); make('p', 'source-limit', body);
    const previewHeading = make('h3', null, body, L.preview); previewHeading.id = prefix + '-preview';
    const preview = make('pre', 'preview', body); preview.tabIndex = 0; preview.setAttribute('aria-labelledby', previewHeading.id);
    const actions = make('div', null, dialog); actions.className = 'ht-export-actions';
    for (const key of ['refresh', 'save', 'cancel']) { const button = make('button', key, actions, L[key]); button.type = 'button'; }
    root.append(container); alive = true; observed = readContext();
    for (const [key, event] of [['filename', 'input'], ['format', 'change'], ['private', 'change']]) on(nodes[key], event, changeDraft);
    on(nodes.refresh, 'click', refresh); on(nodes.save, 'click', save); on(nodes.cancel, 'click', cancel);
    on(dialog, 'keydown', keydown);
    on(dialog, 'cancel', event => { event.preventDefault(); cancel(); });
    on(dialog, 'close', () => { if (alive && nodes?.dialog === dialog) cancel(); });
    try {
      if (typeof dialog.showModal !== 'function') throw new Error('Native export dialog is unavailable');
      dialog.showModal();
    } catch (error) {
      cancel();
      throw error;
    }
    // The consumer supplies exact opener even when its shadow DOM hides activeElement.
    filename.focus();
    if (handoff) {
      for (const key of ['filename', 'format', 'private']) nodes[key].disabled = true;
      preview.focus();
      status('unconfirmed', 'saving');
    } else { status('not_checked', 'changed'); void refresh(); }
  }
  function destroy() { cancel(); destroyed = true; }
  return Object.freeze({ open, cancel, contextChanged, destroy });
}
// END HA TOOLS EXPORT V3

// BEGIN HA CONFIG REPORTS V1 source-sha256=d24ea223a5e99b6f84242674b02d1740528ef96e41414eb57833d0e236604b71
// Config Auditor reviewed report schema. No arbitrary raw-object export/redaction.
function createAuditReports() {
  const schema = 1, method = 'config-findings-v1', maxReports = 20, maxAge = 30 * 86400000;
  const codes = ['success', 'partial', 'unconfirmed', 'error', 'not_checked', 'no_data'];
  // Only identifiers explicitly authored by the current card / server fixtures.
  // Unknown integration identifiers remain visible in live findings, never exported.
  const groups = {
    updates: ['core_update','supervisor_update','os_update','addon_updates','hacs_update'],
    addons: ['host_network','unprotected_addons','auto_update','ssh_addon','mqtt_broker','risky_services','port_exposure','privileged_addons','exposed_addon_ports','non_ingress_addons','bt_usb_addons','supervisor_debug','supervisor_debug_block'],
    network: ['ssl_external','ssl_internal','ssl_cert_managed','ssl_cert_check','camera_exposure','cors_config'],
    inventory: ['user_count','multi_owner','local_only_users','automation_count','camera_count','media_exposure','person_tracking','host_chassis'],
    configuration: ['shell_commands','webhooks','hacs_custom_repos','recorder_retention','unencrypted_backups','mqtt_anonymous','template_sensors'],
    authentication: ['access_tokens','server_auth_providers','server_auth_legacy_api_password','server_auth_trusted_networks','server_auth_admin_mfa'],
    server: ['server_http_transport','server_http_ip_ban','server_http_trusted_proxies','server_yaml_plaintext_secrets'],
  };
  const catalog = Object.entries(groups).flatMap(([category, ids]) => ids.map(id => Object.freeze({id,category})));
  const identities = new Map(catalog.map(c => [c.id,c]));
  const aliases = { many_tokens: 'access_tokens', access_tokens_unavailable: 'access_tokens', mqtt_config: 'mqtt_anonymous' };
  const unknownIds = new Set(['access_tokens_unavailable','mqtt_config','ssl_cert_managed','ssl_cert_check']);
  const limits = ['finding_only_missing_not_resolved','no_remote_probe','bounded_server_scan'];
  const opaque = value => typeof value === 'string' && /^c-[a-f0-9]{32}$/.test(value);
  const validId = value => typeof value === 'string' && /^r-[a-f0-9]{32}$/.test(value);
  const validTime = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
  const version = value => typeof value === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-(?:alpha|beta|rc)(?:\.\d{1,4})?)?$/.test(value) ? value : null;
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const contextCopy = context => {
    if (!context || !['owner','instance','scope'].every(k => opaque(context[k])) || (context.source !== undefined && !['core_uuid_readonly','browser_session'].includes(context.source))) return null;
    return {...Object.fromEntries(['owner','instance','scope'].map(k => [k,context[k]])),source:context.source ?? 'browser_session'};
  };
  function summarize(checks) {
    const counts = Object.fromEntries(codes.map(k => [k,0]));
    checks.forEach(c => counts[c.status]++);
    return counts;
  }
  function snapshot(data, {timestamp,context,id} = {}) {
    if (!data || data.error || !data.findings || !validTime(timestamp) || !validId(id)) return null;
    const found = new Map(); let omitted = false;
    const priority = {not_checked:6,no_data:5,error:4,partial:3,unconfirmed:2,success:1};
    for (const severity of ['critical','warning','info','pass']) {
      const rows = data.findings[severity];
      if (!Array.isArray(rows)) return null;
      for (const f of rows) {
        const identity = aliases[f?.id] || f?.id;
        if (!identities.has(identity)) { omitted = true; continue; }
        // No title/description parsing: missing-data semantics are selected from
        // authored IDs and explicit resultState / skipped / server verification.
        let status = f.skipped || f.verified === false || ['not_checked','no_data'].includes(f.resultState) || unknownIds.has(f.id) ? (f.resultState==='no_data'?'no_data':'not_checked')
          : ['core_update','supervisor_update','mqtt_anonymous'].includes(identity) && severity === 'info' ? 'not_checked'
          : identity.startsWith('server_') && f.verified !== true ? 'not_checked'
          : severity === 'pass' ? 'success' : severity === 'critical' ? 'error' : severity === 'warning' ? 'partial' : 'unconfirmed';
        const row = {id:identity,category:identities.get(identity).category,status,severity:status === 'not_checked' || status === 'no_data' ? 'unknown' : severity};
        const prior = found.get(identity);
        if (!prior || priority[status] > priority[prior.status]) found.set(identity,row);
      }
    }
    const checks = catalog.map(c => found.get(c.id) || {...c,status:'not_checked',severity:'unknown'});
    const counts = summarize(checks);
    return {schema,method,id,timestamp,scope:'current-card-audit',source:'browser-and-config-auditor',serverVersion:version(data.serverVersion),status:checks.every(c=>c.status==='success')?'success':'partial',counts,checks,limits:[...limits,...(omitted?['unreviewed_or_availability_findings_omitted']:[])],context:contextCopy(context)};
  }
  function clean(report) {
    if (!report || report.schema !== schema || report.method !== method || !validId(report.id) || !validTime(report.timestamp) || report.scope !== 'current-card-audit' || report.source !== 'browser-and-config-auditor' || !Array.isArray(report.checks) || report.checks.length !== catalog.length) return null;
    const seen = new Set(), checks = [];
    for (const c of report.checks) {
      const authored = identities.get(c?.id);
      if (!authored || seen.has(c.id) || c.category !== authored.category || !codes.includes(c.status) || !['critical','warning','info','pass','unknown'].includes(c.severity)) return null;
      if ((c.status==='success' && c.severity!=='pass') || (['not_checked','no_data'].includes(c.status) && c.severity!=='unknown')) return null;
      seen.add(c.id);checks.push({id:c.id,category:authored.category,status:c.status,severity:c.severity});
    }
    checks.sort((a,b)=>catalog.findIndex(c=>c.id===a.id)-catalog.findIndex(c=>c.id===b.id));
    return {schema,method,id:report.id,timestamp:report.timestamp,scope:'current-card-audit',source:'browser-and-config-auditor',serverVersion:version(report.serverVersion),status:checks.every(c=>c.status==='success')?'success':'partial',counts:summarize(checks),checks,limits:[...limits,...(report.limits?.includes('unreviewed_or_availability_findings_omitted')?['unreviewed_or_availability_findings_omitted']:[])],context:contextCopy(report.context)};
  }
  function retain(items, now = Date.now()) {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    return items.map(clean).filter(r=>r && Date.parse(r.timestamp)<=now && now-Date.parse(r.timestamp)<=maxAge).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)).filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;}).slice(0,maxReports);
  }
  function load(raw, now = Date.now()) {
    if (typeof raw !== 'string' || raw.length > 1024*1024) return [];
    try { const parsed=JSON.parse(raw);return parsed.schema===schema ? retain(parsed.reports,now) : []; } catch { return []; }
  }
  function compare(before,after) {
    const incompatible = reason => ({compatible:false,reason,checks:[]});
    if (!before || !after) return incompatible('select_two_saved_reports');
    if (before.schema!==after.schema) return incompatible('schema_changed');
    if (before.method!==after.method) return incompatible('method_changed');
    if (before.scope!==after.scope || before.context?.scope!==after.context?.scope) return incompatible('scope_changed');
    if (!contextCopy(before.context) || !contextCopy(after.context)) return incompatible('identity_unconfirmed');
    if (before.context.owner!==after.context.owner) return incompatible('user_changed');
    if (before.context.instance!==after.context.instance) return incompatible(before.context.source==='core_uuid_readonly' && after.context.source==='core_uuid_readonly' ? 'instance_changed' : 'instance_or_session_unconfirmed');
    if (before.serverVersion!==after.serverVersion) return incompatible('integration_version_changed');
    if (Date.parse(before.timestamp)>Date.parse(after.timestamp)) return incompatible('baseline_is_newer');
    const prior = new Map(before.checks.map(c=>[c.id,c]));
    const current = new Map(after.checks.map(c=>[c.id,c]));
    const problem = c => c && ['critical','warning'].includes(c.severity) && ['error','partial'].includes(c.status);
    const known = c => c && !['not_checked','no_data','unconfirmed'].includes(c.status);
    const checks = [...new Set([...prior.keys(),...current.keys()])].map(id=>{
      const a=prior.get(id),b=current.get(id);
      const change=!known(b)||!known(a)?'unknown':problem(a)&&problem(b)?'still_present':problem(a)&&b.status==='success'?'resolved':problem(b)&&!problem(a)?'new':'unchanged';
      return {id,change,status:b?.status||'not_checked',severity:b?.severity||'unknown'};
    });
    return {compatible:true,reason:null,checks};
  }
  function privateCounts(data) {
    return {addons:data?.addonsAvailable===true && Array.isArray(data.addons)?data.addons.length:null,integrations:data?.integrationsAvailable===true && Array.isArray(data.integrations)?data.integrations.length:null,entities:count(data?.entities)};
  }
  function csvCell(value) {
    let text=value===null?'unknown':String(value);
    if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  }
  const labels = {
    en:{source:'Completed browser audit and available Config Auditor checks',scope:'Current card audit; explicit check identities only',limits:'Missing, skipped and unverified checks do not prove resolution or security; remote reachability and certificates were not tested; server scan is bounded.',private:'Aggregate add-on, integration and entity counts only; unknown means not measured.',changes:{new:'New',still_present:'Still present',resolved:'Resolved',unknown:'Unknown / not checked',unchanged:'Unchanged'}},
    pl:{source:'Zakończony audyt karty i dostępne kontrole Config Auditor',scope:'Audyt bieżącej karty; wyłącznie jawne identyfikatory kontroli',limits:'Brakujące, pominięte i niezweryfikowane kontrole nie dowodzą rozwiązania ani bezpieczeństwa; dostępności zdalnej i certyfikatów nie testowano; skan serwera jest ograniczony.',private:'Tylko łączne liczby dodatków, integracji i encji; unknown oznacza brak pomiaru.',changes:{new:'Nowe',still_present:'Nadal obecne',resolved:'Rozwiązane',unknown:'Nieznane / nie sprawdzono',unchanged:'Bez zmian'}},
  };
  function serialize(report, {format,includePrivate=false,privateCounts:privateInventory,language='en',comparison=null}={}) {
    const r=clean(report);if(!r || !['json','csv','txt'].includes(format)) throw new TypeError('Reviewed saved report and explicit format required');
    const pl=String(language).startsWith('pl'),L=labels[pl?'pl':'en'];
    const stateLabels=pl?{success:'Sukces',partial:'Częściowo',unconfirmed:'Niepotwierdzony',error:'Błąd',not_checked:'Nie sprawdzono',no_data:'Brak danych'}:{success:'Success',partial:'Partial',unconfirmed:'Unconfirmed',error:'Error',not_checked:'Not checked',no_data:'No data'};
    const output={schema:r.schema,method:r.method,reportTimestamp:r.timestamp,auditTimestamp:r.timestamp,source:r.source,sourceLabel:L.source,scope:r.scope,scopeLabel:L.scope,serverVersion:r.serverVersion,status:r.status,statusLabel:stateLabels[r.status],counts:r.counts,limits:r.limits,sourceLimit:L.limits,checks:r.checks.map(c=>({...c,statusLabel:stateLabels[c.status]}))};
    if(includePrivate)output.privateInventory={addons:count(privateInventory?.addons),integrations:count(privateInventory?.integrations),entities:count(privateInventory?.entities)};
    if(comparison)output.comparison={compatible:comparison.compatible===true,reason:['select_two_saved_reports','schema_changed','method_changed','scope_changed','identity_unconfirmed','user_changed','instance_changed','instance_or_session_unconfirmed','integration_version_changed','baseline_is_newer'].includes(comparison.reason)?comparison.reason:null,checks:comparison.compatible===true?comparison.checks.filter(c=>identities.has(c.id)&&Object.hasOwn(L.changes,c.change)).map(c=>({id:c.id,change:c.change,label:L.changes[c.change]})):[]};
    if(format==='json')return JSON.stringify(output,null,2)+'\n';
    const rows=[['type','id','value','status','label','severity','category']];
    for(const key of ['schema','method','reportTimestamp','auditTimestamp','source','scope','serverVersion','sourceLimit'])rows.push(['metadata',key,output[key],'','','','']);
    rows.push(['metadata','status',output.status,output.status,output.statusLabel,'','']);
    for(const [key,value] of Object.entries(output.counts))rows.push(['count',key,value,key,stateLabels[key],'','']);
    output.limits.forEach(value=>rows.push(['limit',value,L.limits,'','','','']));
    output.checks.forEach(c=>rows.push(['check',c.id,'',c.status,c.statusLabel,c.severity,c.category]));
    if(includePrivate)for(const [key,value]of Object.entries(output.privateInventory))rows.push(['private_inventory',key,value,'',L.private,'','']);
    if(output.comparison){rows.push(['comparison','compatible',output.comparison.compatible,'',output.comparison.reason||'','','']);output.comparison.checks.forEach(c=>rows.push(['change',c.id,c.change,'',c.label,'','']));}
    return format==='csv'?rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n':rows.map(row=>row.map(v=>v===null?'unknown':String(v)).join(' | ')).join('\n')+'\n';
  }
  return Object.freeze({schema,method,maxReports,maxAge,catalog,snapshot,clean,retain,load,compare,privateCounts,csvCell,serialize,labels});
}
// END HA CONFIG REPORTS V1

const configReports = createAuditReports();
// Opaque tokens exist only in this module instance. Neither account IDs nor HA
// connection/config identities are persisted. A reload cannot confirm continuity.
const reportConnections = new WeakMap();
function reportToken(prefix = 'c-') {
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues) return null;
  globalThis.crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function opaqueMapped(map,key) { if (!map.has(key)) map.set(key,reportToken()); return map.get(key); }

// Component-local persistence retains this card's existing localStorage keys.
const haToolsPersistence = { _cache: {}, _hass: null, setHass(h) { this._hass = h; }, async save(k, d) { try { localStorage.setItem('ha-config-auditor-' + k, JSON.stringify(d)); } catch(e) { console.debug('[ha-config-auditor] caught:', e); } }, async load(k) { try { const r = localStorage.getItem('ha-config-auditor-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, loadSync(k) { try { const r = localStorage.getItem('ha-config-auditor-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };

const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

/**
 * HA Config Auditor - Configuration best-practices audit tool for Home Assistant
 * Checks common configuration best practices: exposed ports, SSL, outdated addons, auth settings, etc.
 */
/* ===== HA Tools split — inline shared infrastructure ===== */
// Bento Design System CSS (inline copy — keeps tool standalone)
const HA_CONFIG_AUDITOR_BENTO_CSS = `
/* ═══════════════════════════════════════════════
   HA Tools — Bento Design System v2.0 (Premium)
   ═══════════════════════════════════════════════ */

/* keyboard a11y */
:focus-visible { outline: 2px solid var(--bento-primary, #6366f1); outline-offset: 2px; border-radius: 3px; }

:host {
  /* Brand palette — diamond top, gradient-friendly */
  --bento-primary: #6366f1;
  --bento-primary-2: #8b5cf6;
  --bento-primary-3: #ec4899;
  --bento-primary-hover: #4f46e5;
  --bento-primary-light: rgba(99, 102, 241, 0.08);
  --bento-primary-glow: rgba(99, 102, 241, 0.35);
  --bento-success: #10B981;
  --bento-success-light: rgba(16, 185, 129, 0.10);
  --bento-success-border: rgba(16, 185, 129, 0.25);
  --bento-error: #EF4444;
  --bento-error-light: rgba(239, 68, 68, 0.10);
  --bento-error-border: rgba(239, 68, 68, 0.25);
  --bento-warning: #F59E0B;
  --bento-warning-light: rgba(245, 158, 11, 0.10);
  --bento-warning-border: rgba(245, 158, 11, 0.25);
  --bento-info: #06b6d4;
  --bento-info-light: rgba(6, 182, 212, 0.10);
  --bento-info-border: rgba(6, 182, 212, 0.25);

  /* Theme */
  --bento-bg:     var(--primary-background-color, #fafaf9);
  --bento-bg-2:   var(--card-background-color, #f5f5f4);
  --bento-card:   var(--card-background-color, #ffffff);
  --bento-glass:  var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.7)));
  --bento-border: var(--divider-color, #e7e5e4);
  --bento-border-strong: rgba(0, 0, 0, 0.08);
  --bento-text:           var(--primary-text-color,   #0c0a09);
  --bento-text-secondary: var(--secondary-text-color, #57534e);
  --bento-text-muted:     var(--disabled-text-color,  #a8a29e);

  /* Radii */
  --bento-radius-xs: 8px;
  --bento-radius-sm: 12px;
  --bento-radius-md: 18px;
  --bento-radius-lg: 24px;
  --bento-radius-pill: 999px;

  /* Shadows — modern, layered */
  --bento-shadow-sm: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.05), 0 2px 6px rgba(0,0,0,0.03);
  --bento-shadow-lg: 0 24px 48px -12px rgba(0,0,0,0.10), 0 12px 24px -8px rgba(0,0,0,0.05);
  --bento-shadow-glow: 0 0 0 1px rgba(99,102,241,0.15), 0 8px 32px -8px rgba(99,102,241,0.25);

  /* Gradients */
  --bento-grad-primary: linear-gradient(135deg, #6366f1, #8b5cf6);
  --bento-grad-rainbow: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
  --bento-grad-success: linear-gradient(135deg, #10b981, #34d399);
  --bento-grad-error:   linear-gradient(135deg, #ef4444, #f87171);
  --bento-grad-warning: linear-gradient(135deg, #f59e0b, #fbbf24);

  /* Motion */
  --bento-trans-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  --bento-trans:      0.25s cubic-bezier(0.4, 0, 0.2, 1);
  --bento-trans-slow: 0.4s cubic-bezier(0.4, 0, 0.2, 1);

  /* Typography */
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
  font-feature-settings: "cv11" 1, "ss01" 1;
  letter-spacing: -0.01em;
  display: block;
  color: var(--bento-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ── Dark mode ───────────────────────────────── */
:host(.bento-dark) {
    --bento-bg:     var(--primary-background-color, #0a0a0f);
    --bento-bg-2:   var(--card-background-color,    #111119);
    --bento-card:   var(--card-background-color,    #16161f);
    --bento-glass:  rgba(22, 22, 31, 0.7);
    --bento-border: var(--divider-color,            #27272f);
    --bento-border-strong: rgba(255, 255, 255, 0.08);
    --bento-text:           var(--primary-text-color,   #fafaf9);
    --bento-text-secondary: var(--secondary-text-color, #d6d3d1);
    --bento-text-muted:     var(--disabled-text-color,  #78716c);
    --bento-primary:        #818cf8;
    --bento-primary-2:      #a78bfa;
    --bento-primary-3:      #f472b6;
    --bento-primary-light:  rgba(129, 140, 248, 0.12);
    --bento-primary-glow:   rgba(129, 140, 248, 0.45);
    --bento-success: #34d399;
    --bento-success-light:  rgba(52, 211, 153, 0.12);
    --bento-success-border: rgba(52, 211, 153, 0.30);
    --bento-error:   #f87171;
    --bento-error-light:    rgba(248, 113, 113, 0.12);
    --bento-error-border:   rgba(248, 113, 113, 0.30);
    --bento-warning: #fbbf24;
    --bento-warning-light:  rgba(251, 191, 36, 0.12);
    --bento-warning-border: rgba(251, 191, 36, 0.30);
    --bento-info:    #22d3ee;
    --bento-info-light:     rgba(34, 211, 238, 0.12);
    --bento-info-border:    rgba(34, 211, 238, 0.30);
    --bento-shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.2);
    --bento-shadow-lg: 0 24px 48px -12px rgba(0,0,0,0.6), 0 12px 24px -8px rgba(0,0,0,0.3);
    --bento-shadow-glow: 0 0 0 1px rgba(129,140,248,0.2), 0 8px 32px -8px rgba(129,140,248,0.5);
    --bento-grad-primary: linear-gradient(135deg, #818cf8, #a78bfa);
    --bento-grad-rainbow: linear-gradient(135deg, #818cf8, #a78bfa 50%, #f472b6);
    color-scheme: dark !important;
  }
:host(.bento-dark) .card, :host(.bento-dark) .card-container, :host(.bento-dark) .main-card, :host(.bento-dark) .panel-card {
    background: var(--bento-card) !important; color: var(--bento-text) !important; border-color: var(--bento-border) !important;
  }
:host(.bento-dark) input, :host(.bento-dark) select, :host(.bento-dark) textarea { background: var(--bento-bg-2); color: var(--bento-text); border-color: var(--bento-border); }
:host(.bento-dark) table th { background: var(--bento-bg-2); color: var(--bento-text-secondary); border-color: var(--bento-border); }
:host(.bento-dark) table td { color: var(--bento-text); border-color: var(--bento-border); }
:host(.bento-dark) pre, :host(.bento-dark) code { background: #1e1e2e !important; color: #e2e8f0 !important; }

/* ── Reset & motion preferences ──────────────── */
* { box-sizing: border-box; }
@media (prefers-reduced-motion: reduce) { * { animation-duration: 0s !important; transition-duration: 0s !important; } }

/* ── Main Card Wrapper ───────────────────────── */
.card {
  background: var(--bento-card);
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-md);
  box-shadow: var(--bento-shadow-md);
  color: var(--bento-text);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  position: relative;
  transition: box-shadow var(--bento-trans), border-color var(--bento-trans);
}

/* ── Header ──────────────────────────────────── */
.header {
  padding: 20px 24px 0;
  display: flex; align-items: center; gap: 12px;
}
.header-icon { font-size: 24px; }
.header-title {
  font-size: 18px; font-weight: 700; letter-spacing: -0.02em;
  color: var(--bento-text);
}
.header-badge {
  margin-left: auto;
  background: var(--bento-grad-primary); color: #fff;
  font-size: 11px; padding: 4px 10px; border-radius: var(--bento-radius-pill);
  font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  box-shadow: 0 4px 14px -2px var(--bento-primary-glow);
}
.content { padding: 20px 24px 24px; }

/* ── Tabs (modern pill style) ────────────────── */
.tabs, .tab-bar, .tab-nav, .tab-header {
  display: flex !important; gap: 4px !important;
  padding: 4px !important;
  background: var(--bento-bg-2) !important;
  border-radius: var(--bento-radius-pill) !important;
  margin-bottom: 20px !important;
  overflow: visible !important;
  -webkit-overflow-scrolling: touch !important;
  flex-wrap: wrap !important; border-bottom: 0 !important;
  width: 100%; max-width: 100%; box-sizing: border-box;
}
.tab, .tab-btn, .tab-button, .dtab {
  padding: 8px 16px !important;
  border: none !important; background: transparent !important; cursor: pointer !important;
  font-size: 13px !important; font-weight: 600 !important;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif !important;
  color: var(--bento-text-secondary) !important;
  border-radius: var(--bento-radius-pill) !important;
  margin-bottom: 0 !important;
  transition: all var(--bento-trans) !important;
  white-space: normal !important; flex: 1 1 auto !important; text-align: center !important; min-height: 44px !important;
  letter-spacing: -0.005em !important;
}
.tab:hover, .tab-btn:hover, .tab-button:hover, .dtab:hover {
  color: var(--bento-text) !important;
  background: var(--bento-card) !important;
}
.tab.active, .tab-btn.active, .tab-button.active, .dtab.active {
  background: var(--bento-card) !important;
  color: var(--bento-primary) !important;
  box-shadow: var(--bento-shadow-sm) !important;
  font-weight: 700 !important;
}
.tab-content { display: block; }
.tab-content.active { animation: bentoFadeIn 0.35s cubic-bezier(0.4, 0, 0.2, 1); }
@keyframes bentoFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Stat / KPI cards (premium) ──────────────── */
.stat-card, .stat-item, .metric-card, .kpi-card {
  background: var(--bento-bg-2) !important;
  border: 1px solid var(--bento-border) !important;
  border-radius: var(--bento-radius-sm) !important;
  padding: 18px !important;
  text-align: left !important;
  transition: transform var(--bento-trans), box-shadow var(--bento-trans), border-color var(--bento-trans);
  position: relative; overflow: hidden;
}
.stat-card::before, .metric-card::before, .kpi-card::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: var(--bento-grad-primary);
  opacity: 0; transition: opacity var(--bento-trans);
}
.stat-card:hover, .stat-item:hover, .metric-card:hover, .kpi-card:hover {
  transform: translateY(-2px); box-shadow: var(--bento-shadow-lg); border-color: var(--bento-primary-light);
}
.stat-card:hover::before, .metric-card:hover::before, .kpi-card:hover::before { opacity: 1; }
.stat-icon { font-size: 22px; margin-bottom: 6px; opacity: 0.85; }
.stat-value, .stat-val, .metric-value, .kpi-val {
  font-size: 26px; font-weight: 800; line-height: 1.1;
  letter-spacing: -0.02em; color: var(--bento-text);
  font-feature-settings: "tnum" 1;
}
.stat-label, .stat-lbl, .metric-label, .kpi-lbl {
  font-size: 11px; color: var(--bento-text-secondary);
  margin-top: 4px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;
}
.stat-num {
  font-size: 24px; font-weight: 800; color: var(--bento-primary);
  font-feature-settings: "tnum" 1; letter-spacing: -0.02em;
}
.stat-sub { font-size: 12px; color: var(--bento-text-muted); font-weight: 500; }

/* ── Overview grid ───────────────────────────── */
.overview-grid, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px; margin-bottom: 20px;
}

/* ── Section headers ─────────────────────────── */
.section-header, .section-title {
  display: flex; align-items: center; justify-content: space-between;
  position: relative; padding-left: 12px;
  font-size: 12px; font-weight: 700; color: var(--bento-text-secondary);
  text-transform: uppercase; letter-spacing: 0.08em;
  margin: 16px 0 10px;
}
.section-header::before, .section-title::before {
  content: ""; width: 4px; height: 4px; border-radius: 50%; background: var(--bento-primary);
  position: absolute; left: 0; top: 50%; transform: translateY(-50%); flex-shrink: 0;
}

/* ── Loading / Empty / Info ──────────────────── */
.loading-bar {
  height: 3px; border-radius: var(--bento-radius-pill);
  background: linear-gradient(90deg, var(--bento-primary), var(--bento-primary-2), transparent);
  background-size: 200% 100%;
  animation: bentoLoad 1.5s linear infinite; margin-bottom: 12px;
}
@keyframes bentoLoad { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.empty-state, .no-data, .no-results {
  text-align: center; color: var(--bento-text-secondary);
  padding: 40px 20px; font-size: 14px;
  background: var(--bento-bg-2); border-radius: var(--bento-radius-md);
  border: 1px dashed var(--bento-border);
}
.info-note, .tip-box {
  font-size: 13px; color: var(--bento-text-secondary);
  background: var(--bento-primary-light);
  border-radius: var(--bento-radius-sm); padding: 12px 14px;
  border-left: 3px solid var(--bento-primary); margin-top: 12px;
  line-height: 1.55;
}
.last-updated {
  font-size: 11px; color: var(--bento-text-muted);
  text-align: right; margin-top: 12px; font-feature-settings: "tnum" 1;
}

/* ── Buttons (premium) ───────────────────────── */
.refresh-btn {
  background: var(--bento-bg-2); border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-pill); padding: 6px 14px;
  font-size: 12px; color: var(--bento-text-secondary);
  cursor: pointer; font-weight: 600; transition: all var(--bento-trans);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif;
}
.refresh-btn:hover {
  background: var(--bento-card); color: var(--bento-primary);
  border-color: var(--bento-primary); transform: translateY(-1px);
  box-shadow: var(--bento-shadow-sm);
}
.toggle-btn, .action-btn {
  background: var(--bento-grad-primary); border: none;
  border-radius: var(--bento-radius-xs); padding: 8px 16px;
  font-size: 13px; color: #fff; cursor: pointer; font-weight: 600;
  transition: all var(--bento-trans); font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif;
  letter-spacing: -0.005em;
  box-shadow: 0 4px 12px -2px var(--bento-primary-glow);
}
.toggle-btn:hover, .action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px -4px var(--bento-primary-glow);
}
.send-btn, .btn-primary {
  width: 100%;
  background: var(--bento-grad-primary); color: #fff;
  border: none; border-radius: var(--bento-radius-sm);
  padding: 12px 20px; font-size: 14px; font-weight: 700;
  cursor: pointer; font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif;
  letter-spacing: -0.01em;
  transition: all var(--bento-trans);
  box-shadow: 0 4px 14px -2px var(--bento-primary-glow);
}
.send-btn:hover, .btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px -6px var(--bento-primary-glow);
}
.send-btn:active, .btn-primary:active { transform: translateY(0); }
.send-btn:disabled, .btn-primary:disabled {
  opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none;
}

/* ── Badges / Status (modern pill) ───────────── */
.badge, .status-badge, .tag, .chip {
  padding: 4px 12px; border-radius: var(--bento-radius-pill);
  font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;
  letter-spacing: 0.04em; text-transform: uppercase;
  border: 1px solid;
}
.badge-ok, .badge-success { background: var(--bento-success-light); color: var(--bento-success); border-color: var(--bento-success-border); }
.badge-er, .badge-error   { background: var(--bento-error-light);   color: var(--bento-error);   border-color: var(--bento-error-border); }
.badge-warn, .badge-warning { background: var(--bento-warning-light); color: var(--bento-warning); border-color: var(--bento-warning-border); }
.badge-info { background: var(--bento-info-light); color: var(--bento-info); border-color: var(--bento-info-border); }

.count-badge {
  font-size: 11px; font-weight: 700; padding: 3px 10px;
  border-radius: var(--bento-radius-pill); display: inline-flex; align-items: center;
  font-feature-settings: "tnum" 1;
}
.error-badge { background: var(--bento-error-light); color: var(--bento-error); border: 1px solid var(--bento-error-border); }
.warn-badge  { background: var(--bento-warning-light); color: var(--bento-warning); border: 1px solid var(--bento-warning-border); }
.info-badge  { background: var(--bento-primary-light); color: var(--bento-primary); border: 1px solid var(--bento-border); }
.ok-badge    { background: var(--bento-success-light); color: var(--bento-success); border: 1px solid var(--bento-success-border); }

/* ── Tables (modern) ─────────────────────────── */
table { width: 100%; border-collapse: separate; border-spacing: 0; }
th {
  background: var(--bento-bg-2); color: var(--bento-text-secondary);
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  padding: 12px 16px; text-align: left;
  border-bottom: 1px solid var(--bento-border);
}
th:first-child { border-top-left-radius: var(--bento-radius-sm); }
th:last-child  { border-top-right-radius: var(--bento-radius-sm); }
td {
  padding: 14px 16px; border-bottom: 1px solid var(--bento-border);
  color: var(--bento-text); font-size: 13px;
}
tr { transition: background var(--bento-trans-fast); }
tr:hover td { background: var(--bento-primary-light); }
tr:last-child td { border-bottom: 0; }

/* ── Forms / Inputs ──────────────────────────── */
input, select, textarea {
  padding: 10px 14px; border: 1.5px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  background: var(--bento-card); color: var(--bento-text);
  font-size: 14px; font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif;
  transition: all var(--bento-trans); outline: none;
  letter-spacing: -0.005em;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--bento-primary);
  box-shadow: 0 0 0 4px var(--bento-primary-light);
}
input::placeholder, textarea::placeholder { color: var(--bento-text-muted); }

/* ── Code blocks ─────────────────────────────── */
code {
  background: var(--bento-bg-2); padding: 2px 6px;
  border-radius: 4px; font-size: 12px;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  border: 1px solid var(--bento-border);
}
pre {
  background: #1e1e2e; color: #e2e8f0;
  padding: 16px; border-radius: var(--bento-radius-sm);
  font-size: 12.5px; overflow-x: auto; line-height: 1.65;
  white-space: pre-wrap; word-break: break-word;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  box-shadow: var(--bento-shadow-md);
}

/* ── Grid layouts ────────────────────────────── */
.schedule-grid, .send-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
}
.schedule-card, .send-card, .info-card {
  background: var(--bento-bg-2); border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-sm); padding: 16px;
  transition: all var(--bento-trans);
}
.schedule-card:hover, .send-card:hover, .info-card:hover {
  border-color: var(--bento-primary-light); transform: translateY(-1px);
  box-shadow: var(--bento-shadow-md);
}

/* ── Log entries ─────────────────────────────── */
.log-entry {
  display: flex; flex-wrap: wrap; align-items: flex-start;
  gap: 4px 8px; padding: 10px 12px;
  border-radius: var(--bento-radius-sm); margin-bottom: 6px;
  font-size: 12.5px; min-width: 0; overflow: hidden;
  border: 1px solid transparent; transition: all var(--bento-trans-fast);
}
.error-entry { background: var(--bento-error-light); border-color: var(--bento-error-border); }
.warn-entry  { background: var(--bento-warning-light); border-color: var(--bento-warning-border); }
.log-time { color: var(--bento-text-muted); font-feature-settings: "tnum" 1; flex-shrink: 0; font-family: "JetBrains Mono", monospace; }
.log-domain {
  font-weight: 700; flex-shrink: 1; min-width: 0; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; word-break: break-all;
}
.error-domain { color: var(--bento-error); }
.warn-domain  { color: var(--bento-warning); }
.log-msg {
  color: var(--bento-text-secondary); flex-basis: 100%;
  word-break: break-word; overflow-wrap: anywhere;
  white-space: pre-wrap; min-width: 0; line-height: 1.55;
}

/* ── Send status ─────────────────────────────── */
.send-status {
  padding: 12px 16px; border-radius: var(--bento-radius-sm);
  margin-top: 14px; font-size: 13px; font-weight: 600;
  text-align: center; letter-spacing: -0.005em;
  border: 1px solid;
}
.send-status.sending { background: var(--bento-primary-light); color: var(--bento-primary); border-color: var(--bento-border); }
.send-status.success { background: var(--bento-success-light); color: var(--bento-success); border-color: var(--bento-success-border); }
.send-status.error   { background: var(--bento-error-light);   color: var(--bento-error);   border-color: var(--bento-error-border); }

/* ── Scrollbar ───────────────────────────────── */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: var(--bento-radius-pill); border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background: var(--bento-text-muted); background-clip: content-box; }

/* ── Animations ──────────────────────────────── */
@keyframes bentoSpin  { to { transform: rotate(360deg); } }
@keyframes bentoPulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
@keyframes bentoSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes bentoStaggerIn { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

/* Apply stagger to grids of stat-cards */
.stats-grid > *, .overview-grid > *, .summary-grid > * {
  animation: bentoStaggerIn 0.35s cubic-bezier(0.4, 0, 0.2, 1) both;
}
.stats-grid > *:nth-child(1)  { animation-delay: 0.02s; }
.stats-grid > *:nth-child(2)  { animation-delay: 0.06s; }
.stats-grid > *:nth-child(3)  { animation-delay: 0.10s; }
.stats-grid > *:nth-child(4)  { animation-delay: 0.14s; }
.stats-grid > *:nth-child(5)  { animation-delay: 0.18s; }
.stats-grid > *:nth-child(6)  { animation-delay: 0.22s; }

/* ── Mobile — 768 px ─────────────────────────── */
@media (max-width: 768px) {
  .content { padding: 16px; }
  .header { padding: 16px 16px 0; }
  .tabs { gap: 2px !important; padding: 3px !important; }
  .tab, .tab-button, .tab-btn { padding: 6px 12px !important; font-size: 12px !important; }
  .overview-grid, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid {
    grid-template-columns: repeat(2, 1fr); gap: 10px;
  }
  .stat-value, .stat-val, .kpi-val, .metric-val { font-size: 22px; }
  .stat-label, .stat-lbl, .kpi-lbl, .metric-lbl { font-size: 10px; }
  .send-grid, .schedule-grid { grid-template-columns: 1fr; }
  .log-entry { flex-wrap: wrap; gap: 2px 6px; padding: 8px 10px; }
  .log-domain { max-width: 60%; font-size: 11.5px; }
  .log-msg { flex-basis: 100%; max-width: 100%; font-size: 11.5px; }
  pre { padding: 12px; font-size: 11.5px; }
  h2 { font-size: 18px; }
  h3 { font-size: 15px; }
  table { font-size: 12.5px; }
  th, td { padding: 10px 12px; }
}
@media (max-width: 480px) {
  .tabs { gap: 1px !important; padding: 2px !important; }
  .tab, .tab-button, .tab-btn { padding: 5px 10px !important; font-size: 11px !important; }
  .overview-grid, .stats-grid, .summary-grid { grid-template-columns: 1fr 1fr; }
  .stat-value, .stat-val, .kpi-val { font-size: 18px; }
}
`;
// Card-owned support footer. Never mutates document or foreign cards.
const _LOCAL_INTRO_KEY = 'ha-intro-dismissed-ha-config-auditor';
const _LOCAL_INTRO = {
  headline: "Configuration best-practices audit with remediation tips.",
  steps: ["Overview shows passed, warning, and failed check counts.","Read each finding and its suggested fix in the Findings tab.","Tips tab — checklist of best practices."]
};
const _LOCAL_INTRO_PL = {
  headline: 'Przegląd konfiguracji i wskazówki dotyczące dobrych praktyk.',
  steps: ['Przegląd pokazuje liczbę pozytywnych wyników, ostrzeżeń i problemów.', 'W zakładce Wyniki przeczytaj każdy wynik i wskazówkę jego poprawy.', 'Zakładka Wskazówki zawiera listę dobrych praktyk.']
};
const _LOCAL_SUPPORT_KEY = 'ha-config-auditor-support-dismissed';
const _LOCAL_DONATE_HTML = '<div class="donate-section" data-source="own-card" style="margin:8px 0 0;padding:4px 0;background:none;border:0;box-shadow:none;min-height:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex-direction:row;justify-content:flex-start;text-align:left"><a href="https://buymeacoffee.com/macsiem" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:var(--secondary-text-color,#64748b);font-weight:400;text-decoration:underline">Optional support for HA Tools</a><button type="button" class="support-dismiss" aria-label="Dismiss support link" style="margin-left:auto;padding:2px 6px;min-height:44px;min-width:44px;line-height:1;border:0;background:none;color:var(--secondary-text-color,#64748b);cursor:pointer">×</button></div>';
function _renderLocalSupport(language) {
  return language === 'pl' ? _LOCAL_DONATE_HTML
    .replace('Optional support for HA Tools', 'Dobrowolne wsparcie HA Tools')
    .replace('Dismiss support link', 'Ukryj link wsparcia') : _LOCAL_DONATE_HTML;
}
function _localSupportDismissed() { try { return localStorage.getItem(_LOCAL_SUPPORT_KEY) === '1'; } catch (_) { return false; } }
function _bindLocalSupportDismiss(root) { root.querySelector('.support-dismiss')?.addEventListener('click', () => { try { localStorage.setItem(_LOCAL_SUPPORT_KEY, '1'); } catch (_) {} root.querySelector('.donate-section[data-source="own-card"]')?.remove(); }); }
function _localIntroDismissed() {
  try { return localStorage.getItem(_LOCAL_INTRO_KEY) === '1'; } catch(e) { return false; }
}
function _renderLocalIntro(language) {
  if (_localIntroDismissed()) return '';
  const intro = language === 'pl' ? _LOCAL_INTRO_PL : _LOCAL_INTRO;
  const dismiss = language === 'pl' ? 'Ukryj instrukcję' : 'Dismiss';
  const steps = intro.steps.map(step => '<li>' + _esc(step) + '</li>').join('');
  return '<div class="intro-banner" data-intro="ha-config-auditor">'
    + '<button class="intro-dismiss" type="button" title="' + _esc(dismiss) + '" aria-label="' + _esc(dismiss) + '">✕</button>'
    + '<div class="intro-headline">💡 ' + _esc(intro.headline) + '</div>'
    + '<ol class="intro-steps">' + steps + '</ol>'
    + '</div>';
}
function _bindLocalIntroDismiss(root) {
  const button = root && root.querySelector('.intro-banner[data-intro="ha-config-auditor"] .intro-dismiss');
  if (!button) return;
  button.addEventListener('click', event => {
    event.stopPropagation();
    try { localStorage.setItem(_LOCAL_INTRO_KEY, '1'); } catch(e) {}
    button.closest('.intro-banner')?.remove();
  });
}
/* ============================================================ */


// Render-time copy: {n} placeholders retain measured values and server evidence.
const AUDIT_COPY_PL = {
  "Overview": "Przegląd",
  "Findings": "Wyniki",
  "Addons & Integrations": "Dodatki i integracje",
  "Network": "Sieć",
  "Users": "Użytkownicy",
  "Tips": "Wskazówki",
  "Running configuration best-practices audit...": "Trwa audyt dobrych praktyk konfiguracji...",
  "Audit failed": "Audyt nie powiódł się",
  "Configuration best-practice summary": "Podsumowanie dobrych praktyk konfiguracji",
  "{0} checks run. Review failed and warning items first, then informational findings.": "Liczba wykonanych kontroli: {0}. Najpierw przejrzyj niezaliczone kontrole i ostrzeżenia, potem informacje.",
  "Failed": "Niezaliczone",
  "Warnings": "Ostrzeżenia",
  "Warning": "Ostrzeżenie",
  "Passed": "Zaliczone",
  "Pass": "Zaliczone",
  "Info": "Informacje",
  "Informational": "Informacje",
  "Failed Checks": "Niezaliczone kontrole",
  "Addons installed": "Zainstalowane dodatki",
  "Addons unavailable": "Dodatki niedostępne",
  "Integrations": "Integracje",
  "{0} entries": "Wpisy: {0}",
  "Integrations unavailable": "Integracje niedostępne",
  "User accounts": "Konta użytkowników",
  "User accounts unavailable": "Konta użytkowników niedostępne",
  "Entities": "Encje",
  "Checks run": "Wykonane kontrole",
  "Last scan: {0}": "Ostatni audyt: {0}",
  "No findings": "Brak wyników",
  "Server-verified": "Zweryfikowano na serwerze",
  "Checked by the Config Auditor integration on the Home Assistant server": "Sprawdzone przez integrację Config Auditor na serwerze Home Assistant",
  "Add-on inventory is unavailable; installed count was not measured.": "Lista dodatków jest niedostępna; nie zmierzono liczby zainstalowanych dodatków.",
  "No addons installed": "Brak zainstalowanych dodatków",
  "User accounts are unavailable; check account permissions or retry as an administrator.": "Konta użytkowników są niedostępne; sprawdź uprawnienia lub ponów próbę jako administrator.",
  "No user accounts found": "Nie znaleziono kont użytkowników",
  "Integration inventory is unavailable; configured count was not measured. Check permissions or use Refresh to retry.": "Lista integracji jest niedostępna; nie zmierzono ich liczby. Sprawdź uprawnienia lub użyj przycisku Odśwież.",
  "No integrations configured": "Brak skonfigurowanych integracji",
  "No network-related findings": "Brak wyników dotyczących sieci",
  "No addons exposing ports": "Brak dodatków udostępniających porty",
  "Add-on port inventory is unavailable; exposure was not measured.": "Lista portów dodatków jest niedostępna; nie zmierzono ich dostępności.",
  "Addon": "Dodatek",
  "Version": "Wersja",
  "State": "Stan",
  "Protection": "Ochrona",
  "Auto-update": "Automatyczne aktualizacje",
  "Host Network": "Sieć hosta",
  "User": "Użytkownik",
  "Role": "Rola",
  "Active": "Aktywny",
  "Local Only": "Tylko lokalnie",
  "System": "Systemowy",
  "Integration": "Integracja",
  "Domain": "Domena",
  "Config-flow source": "Źródło konfiguracji",
  "Status": "Status",
  "Remote Access": "Dostęp zdalny",
  "Nabu Casa Cloud component loaded": "Komponent Nabu Casa Cloud jest załadowany",
  "Not checked": "Nie sprawdzono",
  "The cloud component is loaded. Subscription, active remote tunnel, reachability and TLS were not checked.": "Komponent chmury jest załadowany. Nie sprawdzono subskrypcji, aktywnego tunelu, dostępności ani TLS.",
  "Cloud component not loaded": "Komponent chmury nie jest załadowany",
  "The cloud component is not loaded. Configuration and remote access status were not checked.": "Komponent chmury nie jest załadowany. Nie sprawdzono konfiguracji ani stanu dostępu zdalnego.",
  "External & Internal URLs": "Zewnętrzny i wewnętrzny URL",
  "External URL configured for HTTPS": "Zewnętrzny URL skonfigurowany dla HTTPS",
  "External URL configured for HTTP": "Zewnętrzny URL skonfigurowany dla HTTP",
  "Not tested": "Nie przetestowano",
  "Review configuration": "Sprawdź konfigurację",
  "No External URL": "Brak zewnętrznego URL",
  "Internal URL": "Wewnętrzny URL",
  "{0}. Remote endpoint, reachability and certificate were not tested.": "{0}. Nie przetestowano zdalnego punktu dostępu, dostępności ani certyfikatu.",
  "{0}. Endpoint and certificate were not tested.": "{0}. Nie przetestowano punktu dostępu ani certyfikatu.",
  "Network Info": "Informacje o sieci",
  "Location name": "Nazwa lokalizacji",
  "HA Version": "Wersja HA",
  "Hostname": "Nazwa hosta",
  "OS": "System operacyjny",
  "Time zone": "Strefa czasowa",
  "Network Interfaces": "Interfejsy sieciowe",
  "Exposed Addon Ports": "Udostępniane porty dodatków",
  "Ports": "Porty",
  "Network-Related Findings": "Wyniki dotyczące sieci",
  "Reported flow source: {0}": "Znane źródło konfiguracji: {0}",
  "Flow source unavailable: {0}": "Nieznane źródło konfiguracji: {0}",
  "Errors: {0}": "Błędy: {0}",
  "Integrations ({0})": "Integracje ({0})",
  "Authentication": "Uwierzytelnianie",
  "Enable multi-factor authentication (TOTP) for all user accounts, especially owner accounts. Go to Profile → Multi-factor Authentication.": "Włącz uwierzytelnianie wieloskładnikowe (TOTP) dla wszystkich kont, szczególnie właścicieli. Przejdź do Profil → Uwierzytelnianie wieloskładnikowe.",
  "Network Security": "Bezpieczeństwo sieci",
  "Never expose your HA instance directly to the internet. Use Cloudflare Tunnel, Nabu Casa, or a reverse proxy with SSL. Keep port 8123 behind a firewall.": "Nie udostępniaj HA bezpośrednio w internecie. Użyj Cloudflare Tunnel, Nabu Casa lub odwrotnego proxy z SSL. Chroń port 8123 zaporą.",
  "Updates": "Aktualizacje",
  "Keep HA Core, Supervisor, OS, and all addons up to date. Security patches are regularly released. Enable auto-update for addons when possible.": "Aktualizuj HA Core, Supervisor, system i dodatki. Regularnie pojawiają się poprawki bezpieczeństwa. W miarę możliwości włącz automatyczne aktualizacje dodatków.",
  "Backups": "Kopie zapasowe",
  "Schedule regular automated backups and store them off-site (Google Drive, NAS, etc.). Test backup restoration periodically.": "Zaplanuj regularne automatyczne kopie i przechowuj je poza urządzeniem (Google Drive, NAS itp.). Okresowo sprawdzaj przywracanie kopii.",
  "Audit Trail": "Historia zdarzeń",
  "Review the Logbook regularly for unexpected activity. Monitor login attempts through the System Log. Consider setting up alerts for failed login attempts.": "Regularnie przeglądaj dziennik zdarzeń. Monitoruj próby logowania w dzienniku systemowym. Rozważ alerty o nieudanych logowaniach.",
  "Addon Hygiene": "Utrzymanie dodatków",
  "Remove unused addons. Keep protection mode enabled unless absolutely needed. Review addon permissions (host network, privileged mode) periodically.": "Usuń nieużywane dodatki. Pozostaw ochronę włączoną, chyba że jej wyłączenie jest konieczne. Okresowo sprawdzaj uprawnienia dodatków (sieć hosta, tryb uprzywilejowany).",
  "IoT Network": "Sieć IoT",
  "Isolate IoT devices on a separate VLAN/subnet. Use firewall rules to prevent IoT devices from reaching the internet directly. This limits the blast radius of compromised devices.": "Odizoluj urządzenia IoT w osobnej sieci VLAN lub podsieci. Regułami zapory ogranicz bezpośredni dostęp do internetu, aby zmniejszyć skutki przejęcia urządzenia.",
  "Supervisor API unavailable": "Supervisor API niedostępne",
  "System updates, add-ons and Supervisor network checks were not run. The installation type or account permissions may explain this.": "Nie sprawdzono aktualizacji systemu, dodatków ani sieci Supervisor. Powodem może być wariant instalacji albo brak uprawnień.",
  "Check installation type and account permissions": "Sprawdź typ instalacji i uprawnienia konta",
  "HA Core update available": "Dostępna aktualizacja HA Core",
  "Current: {0} → Latest: {1}": "Bieżąca: {0} → Najnowsza: {1}",
  "Update via Settings → System → Updates": "Zaktualizuj przez Ustawienia → System → Aktualizacje",
  "HA Core is up to date": "HA Core jest aktualny",
  "Version: {0}": "Wersja: {0}",
  "HA Core update status not checked": "Nie sprawdzono aktualności HA Core",
  "Current version: {0}; latest version unavailable": "Bieżąca wersja: {0}; najnowsza wersja niedostępna",
  "Supervisor update available": "Dostępna aktualizacja Supervisor",
  "Update the Supervisor from System settings": "Zaktualizuj Supervisor w ustawieniach systemu",
  "Supervisor is up to date": "Supervisor jest aktualny",
  "Supervisor update status not checked": "Nie sprawdzono aktualności Supervisor",
  "Version comparison data is incomplete.": "Dane porównania wersji są niepełne.",
  "OS update available": "Dostępna aktualizacja systemu",
  "HA OS is up to date": "HA OS jest aktualny",
  "HA OS update status not checked": "Nie sprawdzono aktualizacji HA OS",
  "OS update metadata is incomplete or invalid.": "Dane aktualizacji HA OS są niepełne lub nieprawidłowe.",
  "{0} addon(s) have updates": "Dostępne aktualizacje dodatków: {0}",
  "Update addons via Settings → Add-ons": "Zaktualizuj dodatki przez Ustawienia → Dodatki",
  "All addons up to date": "Wszystkie dodatki są aktualne",
  "{0} addon(s) installed": "Zainstalowane dodatki: {0}",
  "{0} addon(s) use host networking": "Dodatki korzystające z sieci hosta: {0}",
  "Verify these addons require host network access": "Sprawdź, czy te dodatki wymagają dostępu do sieci hosta",
  "{0} addon(s) with protection disabled": "Dodatki z wyłączoną ochroną: {0}",
  "Enable protection mode in addon settings unless you specifically need it disabled": "Włącz ochronę w ustawieniach dodatku, chyba że jej wyłączenie jest konieczne",
  "{0} addon(s) without auto-update": "Dodatki bez automatycznych aktualizacji: {0}",
  "Consider enabling auto-update for non-critical addons": "Rozważ automatyczne aktualizacje mniej istotnych dodatków",
  "External URL is configured for HTTPS": "Zewnętrzny URL skonfigurowany dla HTTPS",
  "Configured URL: {0}. The remote endpoint and certificate were not tested.": "Skonfigurowany URL: {0}. Nie przetestowano zdalnego punktu dostępu ani certyfikatu.",
  "External URL is configured for HTTP": "Zewnętrzny URL skonfigurowany dla HTTP",
  "Configured URL: {0}. Remote reachability was not tested.": "Skonfigurowany URL: {0}. Nie przetestowano zdalnej dostępności.",
  "If this URL is reachable outside your trusted network, configure HTTPS.": "Jeżeli ten URL jest dostępny poza zaufaną siecią, skonfiguruj HTTPS.",
  "No external URL configured": "Brak skonfigurowanego zewnętrznego URL",
  "Remote reachability was not tested.": "Nie przetestowano zdalnej dostępności.",
  "Review remote access separately if you use it.": "Jeżeli używasz dostępu zdalnego, sprawdź go osobno.",
  "Internal URL is configured for HTTPS": "Wewnętrzny URL skonfigurowany dla HTTPS",
  "Configured URL: {0}. The certificate was not tested.": "Skonfigurowany URL: {0}. Nie przetestowano certyfikatu.",
  "Managed SSL provider domain detected": "Wykryto domenę zarządzanego dostawcy SSL",
  "{0} is configured. Certificate status and renewal were not checked.": "Skonfigurowano {0}. Nie sprawdzono certyfikatu ani jego odnawiania.",
  "Verify SSL certificate expiry": "Sprawdź termin ważności certyfikatu SSL",
  "Hostname: {0} — ensure your cert is auto-renewed (Let''s Encrypt, Cloudflare, etc.)": "Host: {0} — sprawdź automatyczne odnawianie certyfikatu (Let's Encrypt, Cloudflare itp.)",
  "Use certbot with auto-renewal or a Cloudflare tunnel for hassle-free SSL": "Użyj certbot z automatycznym odnawianiem lub tunelu Cloudflare",
  "User accounts not checked": "Nie sprawdzono kont użytkowników",
  "The user inventory is unavailable. Check account permissions or retry as an administrator.": "Lista kont jest niedostępna. Sprawdź uprawnienia lub ponów próbę jako administrator.",
  "{0} active user(s)": "Aktywni użytkownicy: {0}",
  "Total registered: {0}": "Łącznie zarejestrowanych: {0}",
  "{0} owner accounts detected": "Wykryte konta właściciela: {0}",
  "Limit owner accounts to minimize attack surface. Demote unnecessary owners to admin.": "Ogranicz liczbę właścicieli. Zmień zbędne konta właściciela na administratorów.",
  "{0} user(s) restricted to local access": "Konta ograniczone do dostępu lokalnego: {0}",
  "{0} shell command(s) configured": "Skonfigurowane polecenia powłoki: {0}",
  "Ensure shell commands don't execute untrusted input": "Sprawdź, czy polecenia powłoki nie wykonują niezaufanych danych wejściowych",
  "SSH addon is running": "Dodatek SSH działa",
  "Ensure SSH uses key-based auth. Disable if not actively needed.": "Używaj uwierzytelniania SSH kluczem. Wyłącz dodatek, gdy nie jest potrzebny.",
  "SSH addon installed but stopped": "Dodatek SSH jest zainstalowany, ale zatrzymany",
  "MQTT broker is running": "Broker MQTT działa",
  "Ensure MQTT has authentication enabled and is not exposed to the internet": "Włącz uwierzytelnianie MQTT i nie udostępniaj brokera w internecie",
  "{0} automations, {1} scripts": "Automatyzacje: {0}, skrypty: {1}",
  "Review automations periodically for unintended actions": "Okresowo sprawdzaj automatyzacje pod kątem niezamierzonych działań",
  "Potentially risky network services": "Potencjalnie ryzykowne usługi sieciowe",
  "Ensure file sharing services are properly secured and only accessible on local network": "Zabezpiecz usługi udostępniania plików i ogranicz ich dostępność do sieci lokalnej",
  "{0} addon(s) expose host ports": "Dodatki udostępniające porty hosta: {0}",
  "Verify each exposed port is necessary. Use Ingress when available to avoid port exposure.": "Sprawdź, czy każdy port jest konieczny. Użyj Ingress, jeżeli jest dostępny.",
  "{0} long-lived access token(s) for the current account": "Tokeny dostępu długoterminowego bieżącego konta: {0}",
  "Only the current account token types were counted. Other users were not checked; ordinary login sessions are excluded.": "Policzono tylko typy tokenów bieżącego konta. Nie sprawdzono innych użytkowników; zwykłe sesje logowania pominięto.",
  "Review unused tokens in your Profile. Token values were not read or stored.": "Sprawdź nieużywane tokeny w Profilu. Nie odczytano ani nie zapisano ich wartości.",
  "Long-lived access tokens not checked": "Nie sprawdzono tokenów dostępu długoterminowego",
  "Current-account token metadata is unavailable or unsupported. Other users were not checked. Review tokens manually in your Profile.": "Metadane tokenów bieżącego konta są niedostępne lub nieobsługiwane. Nie sprawdzono innych użytkowników. Sprawdź tokeny ręcznie w Profilu.",
  "{0} camera(s) detected with external access": "Kamery z dostępem zewnętrznym: {0}",
  "Camera streams may be accessible via external URL": "Strumienie kamer mogą być dostępne przez zewnętrzny URL",
  "Ensure camera streams are not publicly accessible. Use Frigate Privacy or VPN for remote access.": "Nie udostępniaj strumieni kamer publicznie. Użyj Frigate Privacy lub VPN do dostępu zdalnego.",
  "{0} webhook-related entit(ies)": "Encje powiązane z webhookami: {0}",
  "Webhooks provide URL-based access to HA actions": "Webhooki umożliwiają uruchamianie działań HA przez URL",
  "Ensure webhook URLs are kept secret and rotated periodically": "Chroń adresy webhooków i okresowo je zmieniaj",
  "{0} custom HACS repository(ies) installed": "Zainstalowane własne repozytoria HACS: {0}",
  "Review custom repositories for trust and source quality": "Sprawdź zaufanie i jakość źródeł własnych repozytoriów",
  "Server-side checks are not available": "Kontrole serwerowe są niedostępne",
  "Login providers, administrator two-factor authentication, IP banning, trusted proxies and plain-text secrets in YAML can only be verified by the Config Auditor integration. They are not reported as passed.": "Dostawców logowania, uwierzytelnianie dwuskładnikowe administratorów, blokowanie IP, zaufane proxy i jawne sekrety YAML może sprawdzić tylko integracja Config Auditor. Nie oznaczono tych kontroli jako zaliczonych.",
  "Install the Config Auditor integration (see the README), then add it in Settings → Devices & services (administrator account required).": "Zainstaluj integrację Config Auditor (patrz README), następnie dodaj ją przez Ustawienia → Urządzenia i usługi (wymagane konto administratora).",
  "{0} addon(s) with privileged access": "Dodatki z dostępem uprzywilejowanym: {0}",
  "Privileged addons have root-level access. Verify they are trustworthy and necessary.": "Dodatki uprzywilejowane mają dostęp root. Sprawdź, czy są zaufane i konieczne.",
  "{0} addon(s) expose port(s)": "Dodatki udostępniające porty: {0}",
  "Ensure exposed ports are not accessible from the internet. Use firewall rules if needed.": "Nie udostępniaj portów w internecie. W razie potrzeby dodaj reguły zapory.",
  "{0} addon(s) not using Ingress": "Dodatki nieużywające Ingress: {0}",
  "Consider using Ingress for safer addon access (only through HA UI)": "Rozważ Ingress dla bezpieczniejszego dostępu do dodatków przez interfejs HA",
  "{0} automation(s)/script(s) with webhook(s)": "Automatyzacje lub skrypty z webhookami: {0}",
  "Webhooks expose endpoints that can be triggered from the internet": "Webhooki udostępniają punkty dostępu, które można wywołać z internetu",
  "Ensure webhook URLs are not shared publicly. Use strong secrets in webhook URLs.": "Nie udostępniaj publicznie adresów webhooków. Używaj silnych sekretów w ich adresach.",
  "{0} camera(s) configured": "Skonfigurowane kamery: {0}",
  "Camera streams should not be exposed directly to the internet": "Nie udostępniaj strumieni kamer bezpośrednio w internecie",
  "Use Secure (SSL/TLS) connection. Do not expose camera ports directly. Use Nabu Casa or tunnel.": "Używaj SSL/TLS. Nie udostępniaj portów kamer bezpośrednio. Użyj Nabu Casa lub tunelu.",
  "{0} media player(s) configured": "Skonfigurowane odtwarzacze multimediów: {0}",
  "Ensure media sources are not serving public content": "Sprawdź, czy źródła multimediów nie udostępniają treści publicznie",
  "Use local media libraries. Do not expose media over the internet unless necessary.": "Używaj lokalnych bibliotek. Nie udostępniaj multimediów w internecie bez potrzeby.",
  "Recorder keeping data for {0} days": "Recorder przechowuje dane przez {0} dni",
  "Long retention can be a privacy concern if you have guests or visitors": "Długie przechowywanie danych może naruszać prywatność gości",
  "Consider reducing purge_keep_days in configuration.yaml if privacy is a concern": "Rozważ zmniejszenie purge_keep_days w configuration.yaml dla ochrony prywatności",
  "Supervisor debug mode is enabled": "Tryb debugowania Supervisor jest włączony",
  "Debug mode exposes additional logs and should not stay enabled outside troubleshooting": "Debugowanie udostępnia dodatkowe logi i powinno działać tylko podczas diagnozowania",
  "Disable debug mode in Supervisor settings unless troubleshooting": "Wyłącz debugowanie w ustawieniach Supervisor po zakończeniu diagnozowania",
  "Supervisor debug block is enabled": "Blokada debugowania Supervisor jest włączona",
  "This is a development/testing feature": "To funkcja programistyczna i testowa",
  "Ensure this is intentional and not left enabled in production": "Sprawdź, czy to zamierzone i czy nie pozostało włączone w produkcji",
  "HACS addon has an update available": "Dostępna aktualizacja dodatku HACS",
  "Update HACS addon from Settings → Add-ons": "Zaktualizuj HACS przez Ustawienia → Dodatki",
  "HACS addon is up to date": "Dodatek HACS jest aktualny",
  "{0} addon(s) with Bluetooth/USB access": "Dodatki z dostępem Bluetooth/USB: {0}",
  "Verify that these addons are trustworthy. USB/Bluetooth access provides direct hardware access.": "Sprawdź zaufanie do tych dodatków. USB/Bluetooth zapewnia bezpośredni dostęp do sprzętu.",
  "Host hardware type": "Typ sprzętu hosta",
  "Supervisor reports chassis: {0}. This does not establish installation type or network isolation.": "Supervisor zgłasza typ obudowy: {0}. Nie określa to rodzaju instalacji ani izolacji sieciowej.",
  "{0} backup(s) without encryption": "Kopie zapasowe bez szyfrowania: {0}",
  "Unencrypted backups expose sensitive data": "Nieszyfrowane kopie ujawniają dane wrażliwe",
  "Create new backups with a password. Set a backup password in Settings → System → Backups": "Twórz kopie z hasłem. Ustaw hasło przez Ustawienia → System → Kopie zapasowe",
  "MQTT allows anonymous connections": "MQTT pozwala na anonimowe połączenia",
  "Anyone on the network can connect to your MQTT broker without authentication": "Każdy w sieci może połączyć się z brokerem MQTT bez uwierzytelniania",
  "Disable anonymous access in Mosquitto addon configuration and set up proper user credentials": "Wyłącz anonimowy dostęp w Mosquitto i ustaw dane uwierzytelniające użytkowników",
  "MQTT requires authentication": "MQTT wymaga uwierzytelniania",
  "Anonymous connections are disabled": "Anonimowe połączenia są wyłączone",
  "MQTT anonymous access not checked": "Nie sprawdzono anonimowego dostępu MQTT",
  "The add-on response did not include an explicit anonymous setting.": "Odpowiedź dodatku nie zawierała jawnego ustawienia dostępu anonimowego.",
  "Could not verify MQTT configuration": "Nie udało się sprawdzić konfiguracji MQTT",
  "Unable to read Mosquitto addon settings": "Nie można odczytać ustawień Mosquitto",
  "Manually verify MQTT authentication settings": "Sprawdź ręcznie ustawienia uwierzytelniania MQTT",
  "{0} template/command_line entities": "Encje template/command_line: {0}",
  "Large number of template entities may indicate complex configs that need review": "Wiele encji szablonowych może oznaczać złożoną konfigurację wymagającą przeglądu",
  "Periodically review template sensors for unintended access or command execution paths": "Okresowo sprawdzaj szablony pod kątem niezamierzonego dostępu lub wykonywania poleceń",
  "CORS or external URL allowlist configured": "Skonfigurowano CORS lub listę dozwolonych zewnętrznych URL",
  "Cross-origin requests or external URLs are permitted": "Dozwolono żądania z innych źródeł lub zewnętrzne URL",
  "Review allowed origins and URLs to ensure they are trusted": "Sprawdź zaufanie do dozwolonych źródeł i URL",
  "External URL includes port 8123": "Zewnętrzny URL zawiera port 8123",
  "Configured external URL: {0}. Internet reachability was not tested.": "Skonfigurowany zewnętrzny URL: {0}. Nie sprawdzono dostępności z internetu.",
  "Review firewall and reverse proxy configuration if remote access is intended.": "Jeżeli zamierzasz używać dostępu zdalnego, sprawdź zaporę i odwrotne proxy.",
  "{0} person(s) tracked": "Śledzone osoby: {0}",
  "Location data is sensitive PII": "Dane lokalizacyjne są wrażliwymi danymi osobowymi",
  "Ensure only trusted users have access to person entities. Review recorder include/exclude.": "Ogranicz dostęp do encji osób do zaufanych użytkowników. Sprawdź include/exclude w recorder.",
  "Login providers could not be assessed": "Nie udało się ocenić dostawców logowania",
  "No active provider was visible when this audit ran.": "Podczas audytu nie był widoczny żaden aktywny dostawca logowania.",
  "Legacy API password login is enabled": "Logowanie wspólnym hasłem API jest włączone",
  "The legacy_api_password auth provider lets anyone who knows one shared password log in.": "Dostawca legacy_api_password pozwala zalogować się każdemu znającemu wspólne hasło.",
  "Remove the legacy_api_password provider from homeassistant: auth_providers and use user accounts with long-lived tokens.": "Usuń legacy_api_password z homeassistant: auth_providers i używaj kont z tokenami długoterminowymi.",
  "Trusted networks login is enabled": "Logowanie z zaufanych sieci jest włączone",
  "Trusted networks login is enabled with login bypass": "Logowanie z zaufanych sieci z pominięciem ekranu logowania jest włączone",
  "Devices in these networks can log in without a password.": "Urządzenia w tych sieciach mogą logować się bez hasła.",
  "Devices in these networks can log in without a password and skip the login screen.": "Urządzenia w tych sieciach mogą logować się bez hasła i pomijać ekran logowania.",
  "Limit trusted_networks to single, fixed addresses (for example a wall tablet) and avoid allow_bypass_login.": "Ogranicz trusted_networks do pojedynczych stałych adresów (np. tabletu ściennego) i unikaj allow_bypass_login.",
  "No legacy API password or trusted-network login provider detected": "Nie wykryto logowania wspólnym hasłem API ani przez zaufane sieci",
  "Enabled auth providers: {0}.": "Włączeni dostawcy logowania: {0}.",
  "No administrator can log in from outside the local network": "Żaden administrator nie może logować się spoza sieci lokalnej",
  "All active administrators are restricted to local access.": "Wszyscy aktywni administratorzy mają wyłącznie dostęp lokalny.",
  "{0} administrator(s) without two-factor authentication": "Administratorzy bez uwierzytelniania dwuskładnikowego: {0}",
  "Administrators without MFA: {0}.": "Administratorzy bez MFA: {0}.",
  "Each administrator can enable two-factor authentication in their profile (Security → Multi-factor authentication modules).": "Każdy administrator może włączyć uwierzytelnianie dwuskładnikowe w profilu (Bezpieczeństwo → Moduły uwierzytelniania wieloskładnikowego).",
  "All administrators use two-factor authentication": "Wszyscy administratorzy używają uwierzytelniania dwuskładnikowego",
  "{0} administrator(s) have an MFA module enabled.": "Administratorzy z włączonym modułem MFA: {0}.",
  "Home Assistant serves HTTPS": "Home Assistant udostępnia HTTPS",
  "The built-in web server uses a TLS certificate.": "Wbudowany serwer WWW używa certyfikatu TLS.",
  "The configured external URL uses HTTPS; this check did not test the proxy or certificate from outside the network.": "Zewnętrzny URL używa HTTPS; ta kontrola nie testowała proxy ani certyfikatu spoza sieci.",
  "Remote access uses Home Assistant Cloud (HTTPS)": "Dostęp zdalny używa Home Assistant Cloud (HTTPS)",
  "Remote access goes through the encrypted Home Assistant Cloud connection; the local network uses plain HTTP.": "Dostęp zdalny korzysta z szyfrowanego połączenia Home Assistant Cloud; sieć lokalna używa zwykłego HTTP.",
  "External URL uses plain HTTP": "Zewnętrzny URL używa nieszyfrowanego HTTP",
  "Logins and tokens sent to the external URL are not encrypted.": "Logowania i tokeny wysyłane do zewnętrznego URL nie są szyfrowane.",
  "Put Home Assistant behind HTTPS (reverse proxy, Home Assistant Cloud or a certificate) and update the external URL.": "Skonfiguruj HTTPS (odwrotne proxy, Home Assistant Cloud lub certyfikat) i zaktualizuj zewnętrzny URL.",
  "Home Assistant is served over plain HTTP on the local network": "Home Assistant używa nieszyfrowanego HTTP w sieci lokalnej",
  "No external HTTPS URL is configured. This is fine for local-only use.": "Nie skonfigurowano zewnętrznego URL HTTPS. To wystarcza do dostępu wyłącznie lokalnego.",
  "If you open Home Assistant to the internet, use HTTPS.": "Jeżeli udostępniasz Home Assistant w internecie, używaj HTTPS.",
  "Trusted proxies could not be read": "Nie udało się odczytać zaufanych proxy",
  "The HTTP server is not available yet.": "Serwer HTTP nie jest jeszcze dostępny.",
  "No reverse proxy is trusted": "Żadne odwrotne proxy nie jest zaufane",
  "X-Forwarded-For headers are not trusted from any address.": "Nagłówki X-Forwarded-For nie są zaufane z żadnego adresu.",
  "Every address is trusted as a proxy": "Każdy adres jest traktowany jako zaufane proxy",
  "trusted_proxies contains {0}, so any client can fake its IP address and bypass IP bans.": "trusted_proxies zawiera {0}, więc każdy klient może podszyć się pod inny adres IP i ominąć blokady.",
  "List only the address of your reverse proxy in trusted_proxies.": "W trusted_proxies wpisz tylko adres własnego odwrotnego proxy.",
  "Large public networks are trusted as proxies": "Duże publiczne sieci są traktowane jako zaufane proxy",
  "trusted_proxies includes {0}.": "trusted_proxies zawiera {0}.",
  "Narrow trusted_proxies to the exact proxy addresses.": "Ogranicz trusted_proxies do dokładnych adresów proxy.",
  "Trusted proxies are limited to bounded networks or addresses": "Zaufane proxy są ograniczone do wskazanych sieci lub adresów",
  "Trusted proxies: {0}.": "Zaufane proxy: {0}.",
  "IP ban settings could not be read": "Nie udało się odczytać ustawień blokowania IP",
  "Failed logins lead to an IP ban": "Nieudane logowania powodują blokadę IP",
  "An address is banned after {0} failed login attempt(s). Banned addresses: {1}.": "Adres jest blokowany po {0} nieudanych próbach logowania. Zablokowane adresy: {1}.",
  "Failed logins do not lead to an IP ban": "Nieudane logowania nie powodują blokady IP",
  "ip_ban_enabled is off or login_attempts_threshold is not set, so password guessing is not throttled.": "ip_ban_enabled jest wyłączone lub nie ustawiono login_attempts_threshold, więc próby odgadywania hasła nie są ograniczane.",
  "Set ip_ban_enabled: true and login_attempts_threshold (for example 5) in the http: section.": "W sekcji http: ustaw ip_ban_enabled: true i login_attempts_threshold (np. 5).",
  "{0} secret-looking value(s) written directly in YAML": "Wartości przypominające sekrety zapisane bezpośrednio w YAML: {0}",
  "Found in {0}. Values are not shown.": "Znaleziono w {0}. Wartości nie są wyświetlane.",
  "Found in {0}. Values are not shown. Scan incomplete; more findings may exist.": "Znaleziono w {0}. Wartości nie są wyświetlane. Skan jest niepełny; mogą istnieć kolejne wyniki.",
  "Move each value to secrets.yaml and reference it with !secret.": "Przenieś wartości do secrets.yaml i odwołuj się do nich przez !secret.",
  "YAML secret scan incomplete": "Skan sekretów YAML jest niepełny",
  "Scan incomplete: {0} file(s) checked, {1} skipped, limit reached: {2}.": "Skan niepełny: sprawdzone pliki: {0}, pominięte: {1}, osiągnięto limit: {2}.",
  "Check unreadable or oversized YAML files and rerun the audit.": "Sprawdź nieczytelne lub zbyt duże pliki YAML i ponów audyt.",
  "No match in the heuristic YAML secret scan": "Brak dopasowań w heurystycznym skanie sekretów YAML",
  "Scanned {0} YAML file(s) in the bounded configuration scope; no matching key/value line found. This does not prove all secrets use !secret.": "Przeskanowano {0} plików YAML w ograniczonym zakresie konfiguracji; brak dopasowania klucza i wartości. To nie dowodzi, że wszystkie sekrety używają !secret.",
  "Check could not run": "Nie udało się wykonać kontroli",
  "{0}; check did not complete.": "{0}; kontrola nie została ukończona.",
  "{0} (not checked)": "{0} (nie sprawdzono)",
  "N/A": "Brak danych",
  "Not configured": "Nie skonfigurowano",
  "N/A \u2014 no internal URL configured": "Brak danych — nie skonfigurowano wewnętrznego URL",
  "Owner": "Właściciel",
  "Admin": "Administrator",
  "Inactive": "Nieaktywny",
  "Unnamed": "Bez nazwy",
  "On": "Włączone",
  "Off": "Wyłączone",
  "Yes": "Tak",
  "No": "Nie",
  "Enabled": "Włączony",
  "Disabled": "Wyłączony",
  "Connected": "Połączony",
  "Disconnected": "Rozłączony",
  "Link status": "Stan połączenia",
  "Gateway": "Brama",
  "Method": "Metoda",
  "Signal": "Sygnał",
  "started": "Uruchomiony",
  "stopped": "Zatrzymany",
  "loaded": "Załadowana",
  "setup_error": "Błąd konfiguracji",
  "not_loaded": "Niezaładowana",
  "unknown": "Nieznany"
};
const AUDIT_COPY_PATTERNS = Object.entries(AUDIT_COPY_PL).filter(([key]) => key.includes("{0}")).map(([key, value]) => {
  const parts = key.split(/\{\d+\}/);
  const pattern = parts.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("([\\s\\S]*?)");
  return [new RegExp("^" + pattern + "$"), value];
});


// W3 reuses Device Health's original-node movement and Data Exporter's name/state
// plus labelled fields. Inventory reads, source guards and report state stay owned
// by their existing paths. A content-width change only changes presentation.
function _disconnectConfigInventory(card) {
  card._inventoryObserver?.disconnect();
  card._inventoryObserver = null;
}
function _rememberConfigInventory(card) {
  const active = card.shadowRoot?.activeElement;
  let focus = null;
  for (const mount of card._inventoryMounts || []) {
    for (const item of mount.items) {
      item.open = item.detail.open;
      if (item.row.contains(active) || item.detail.contains(active)) {
        focus = { key: item.key, node: active, id: active.id,
          selection: typeof active.selectionStart === 'number'
            ? [active.selectionStart, active.selectionEnd, active.selectionDirection] : null };
      }
    }
  }
  return focus;
}
function _focusConfigInventory(card, focus) {
  if (!focus) return;
  for (const mount of card._inventoryMounts || []) {
    const item = mount.items.find(item => item.key === focus.key);
    if (!item) continue;
    const original = focus.node;
    let target = original && (item.row.contains(original) || item.detail.contains(original)) ? original : null;
    if (!target && focus.id) target = card.shadowRoot.getElementById(focus.id);
    if (!target || target === item.row || target === item.summary) target = mount.narrow ? item.summary : item.row;
    if (mount.narrow && target !== item.summary) { item.detail.open = true; item.open = true; }
    if (target === item.row) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    if (focus.selection && typeof target.setSelectionRange === 'function') target.setSelectionRange(...focus.selection);
    return;
  }
}
function _bindConfigInventory(card, restoreFocus = null) {
  const root = card.shadowRoot, content = root?.getElementById('content');
  _disconnectConfigInventory(card);
  const previous = card._inventoryMounts || [];
  const tables = Array.from(content?.querySelectorAll('table[data-config-inventory]') || []);
  const doc = card.ownerDocument;
  card._inventoryMounts = tables.map(table => {
    const kind = table.dataset.configInventory;
    let mount = previous.find(item => item.kind === kind);
    const incomingWide = table.parentElement;
    if (!mount) {
      const layout = doc.createElement('div'); layout.className = 'ht-config-layout';
      const list = doc.createElement('div'); list.className = 'ht-config-records'; list.dataset.inventory = kind; list.hidden = true;
      incomingWide.before(layout); layout.append(incomingWide, list);
      mount = {kind, layout, list, wide:incomingWide, table, items:[], narrow:false};
    }
    const headers = Array.from(table.tHead.rows[0].cells, cell => cell.textContent.trim());
    const oldItems = mount.items, occurrences = new Map();
    const incomingRows = Array.from(table.tBodies[0].rows);
    mount.items = incomingRows.map(row => {
      const identity = row.dataset.inventoryKey || '';
      const ordinal = occurrences.get(identity) || 0; occurrences.set(identity, ordinal + 1);
      const key = JSON.stringify([kind, identity, ordinal]);
      let item = oldItems.find(item => item.key === key);
      if (!item) {
        const detail = doc.createElement('details'); detail.dataset.inventoryRecord = key;
        const summary = doc.createElement('summary');
        const name = doc.createElement('strong'), state = doc.createElement('span'); state.dataset.recordState = '';
        summary.append(name, state);
        if (kind === 'users') { const role = doc.createElement('span'); role.dataset.recordRole = ''; summary.append(role); }
        const fields = doc.createElement('dl'); fields.className = 'record-fields'; detail.append(summary, fields);
        item = {key, row, detail, summary, fields, cells:[], open:false};
      }
      const incomingCells = Array.from(row.cells);
      item.summary.firstElementChild.textContent = incomingCells[0].textContent;
      item.summary.querySelector('[data-record-state]').textContent = incomingCells[kind === 'integrations' || kind === 'ports' ? 3 : 2].textContent.trim();
      if (kind === 'users') item.summary.querySelector('[data-record-role]').textContent = incomingCells[1].textContent;
      item.cells = incomingCells.map((cell, index) => {
        const html = cell.innerHTML;
        let field = item.cells[index];
        if (!field) {
          const label = doc.createElement('dt'), value = doc.createElement('dd');
          // Prevent later UI-label translation from altering raw inventory values.
          value.dataset.auditValue = '';
          item.fields.append(label, value);
          field = {cell, label, value, nodes:Array.from(cell.childNodes), html};
        } else if (field.html !== html) {
          field.cell.replaceChildren(); field.value.replaceChildren();
          field.nodes = Array.from(cell.childNodes); field.html = html;
        }
        // Newly arriving rows must enter the current representation immediately.
        (mount.narrow ? field.value : field.cell).append(...field.nodes);
        field.label.textContent = headers[index];
        field.cell.style.cssText = cell.style.cssText;
        field.value.style.cssText = cell.style.cssText;
        return field;
      });
      item.detail.open = item.open;
      return item;
    });
    // On repaint keep original record/value nodes and their handlers. Only cells
    // whose rendered value changed (e.g. a localized state) receive new contents.
    if (mount.table !== table) {
      mount.table.tHead.replaceWith(table.tHead);
      mount.table.tBodies[0].replaceChildren(...mount.items.map(item => item.row));
      incomingWide.replaceWith(mount.layout);
    }
    mount.list.replaceChildren(...mount.items.map(item => item.detail));
    return mount;
  });
  if (!tables.length) return;
  const mounts = card._inventoryMounts;
  const applyWidth = width => {
    if (!Number.isFinite(width) || width <= 0) return;
    for (const mount of mounts) {
      const narrow = width < 500;
      if (narrow === mount.narrow) continue;
      const focused = _rememberConfigInventory(card);
      // Reveal before moving focused original nodes; only one representation owns them.
      if (narrow) mount.list.hidden = false; else mount.wide.hidden = false;
      mount.items.forEach(item => item.cells.forEach(({cell,value,nodes}) => (narrow ? value : cell).append(...nodes)));
      mount.narrow = narrow;
      if (focused && mount.items.some(item => item.key === focused.key)) _focusConfigInventory(card, focused);
      mount.wide.hidden = narrow; mount.list.hidden = !narrow;
    }
  };
  if (typeof ResizeObserver === 'function' && card.isConnected) {
    const style = getComputedStyle(content);
    const measured = content.getBoundingClientRect().width
      - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
      - (parseFloat(style.borderLeftWidth) || 0) - (parseFloat(style.borderRightWidth) || 0);
    if (measured > 0) card._inventoryWidth = measured;
    const observer = new ResizeObserver(entries => {
      if (!card.isConnected || card._inventoryObserver !== observer || card._inventoryMounts !== mounts || root.getElementById('content') !== content) return;
      const entry = entries.find(item => item.target === content);
      const width = entry?.contentRect.width;
      if (!Number.isFinite(width) || width <= 0) return;
      card._inventoryWidth = width; applyWidth(width);
    });
    card._inventoryObserver = observer; observer.observe(content);
  }
  applyWidth(typeof ResizeObserver === 'function' ? card._inventoryWidth || 900 : 900);
  _focusConfigInventory(card, restoreFocus);
}
const _CONFIG_INVENTORY_CSS = `
#content,.ht-config-layout {min-width:0;max-width:100%;}
.ht-config-layout [hidden] {display:none !important;}
.ht-config-records > details {min-width:0;max-width:100%;border-bottom:1px solid var(--bento-border);padding:8px 0;}
.ht-config-records summary {cursor:pointer;min-height:44px;box-sizing:border-box;padding:8px;white-space:normal;overflow-wrap:anywhere;}
.ht-config-records summary strong,.ht-config-records summary > span {display:block;min-width:0;max-width:100%;overflow-wrap:anywhere;}
.ht-config-records summary > span {margin-top:4px;}
.ht-config-records .record-fields {display:grid;grid-template-columns:minmax(0,1fr);gap:4px;margin:8px;}
.ht-config-records dt {font-size:12px;color:var(--bento-text-secondary);margin-top:8px;}
.ht-config-records dd {margin:0;min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;}
.ht-config-records code {white-space:normal;overflow-wrap:anywhere;box-decoration-break:clone;}
.ht-config-layout tr:focus-visible {outline:3px solid var(--primary-color,#1769aa);outline-offset:-3px;}
`;

// Card-local presentation only: current navigation is the sole source of picker options.
function _rememberTabFocus(card) {
  const active = card.shadowRoot?.activeElement;
  if (active?.id === 'ha-tools-tab-picker') return { picker: true };
  if (active?.closest('.tabs') && active.dataset.tab) return { tab: active.dataset.tab };
  return null;
}
function _bindResponsiveTabs(card, restoreFocus = null) {
  const root = card.shadowRoot;
  const nav = root?.querySelector('.tabs');
  if (!nav) { card._tabResizeObserver?.disconnect(); card._tabResizeObserver = null; card.removeAttribute('data-responsive-tabs-observed'); return; }
  let label = root.querySelector('.ht-tab-picker');
  if (!label) {
    label = card.ownerDocument.createElement('div');
    label.className = 'ht-tab-picker';
    const text = card.ownerDocument.createElement('label'); text.htmlFor = 'ha-tools-tab-picker'; label.append(text);
    const select = card.ownerDocument.createElement('select');
    select.id = 'ha-tools-tab-picker'; label.append(select); nav.before(label);
    select.addEventListener('change', () => {
      const currentNav = root.querySelector('.tabs');
      const button = Array.from(currentNav?.querySelectorAll('button[data-tab]') || [])
        .find(item => item.dataset.tab === select.value && !item.disabled && !item.hidden);
      // Reuse the exact existing navigation/action path, including its guards.
      if (button) button.click();
      _bindResponsiveTabs(card);
    });
  }
  label.firstElementChild.textContent = card._lang === 'pl' ? 'Zakładka' : 'Tab';
  const select = label.querySelector('select');
  const buttons = Array.from(nav.querySelectorAll('button[data-tab]')).filter(button => !button.hidden && !button.disabled);
  const options = Array.from(select.options);
  if (options.length !== buttons.length || buttons.some((button, index) => options[index]?.value !== button.dataset.tab)) {
    select.replaceChildren(...buttons.map(button => {
      const option = card.ownerDocument.createElement('option'); option.value = button.dataset.tab; return option;
    }));
  }
  buttons.forEach((button, index) => { select.options[index].textContent = button.getAttribute('aria-label') || button.textContent.trim(); });
  const selected = buttons.find(button => button.classList.contains('active'));
  select.value = selected?.dataset.tab || '';
  const applyWidth = width => {
    const currentNav = root.querySelector('.tabs'), currentLabel = root.querySelector('.ht-tab-picker');
    if (!currentNav || !currentLabel) return;
    const input = currentLabel.querySelector('select');
    const active = root.activeElement;
    const narrow = width < 280;
    const fromTab = currentNav.contains(active), fromPicker = active === input;
    currentNav.hidden = narrow; currentLabel.hidden = !narrow;
    if (narrow && fromTab) input.focus({ preventScroll: true });
    else if (!narrow && fromPicker) currentNav.querySelector('button.active')?.focus({ preventScroll: true });
  };
  if (card._tabContainerWidth == null) {
    const style = getComputedStyle(card);
    card._tabContainerWidth = card.getBoundingClientRect().width
      - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
      - (parseFloat(style.borderLeftWidth) || 0) - (parseFloat(style.borderRightWidth) || 0);
  }
  // Zero-width detached/test hosts default to tabs until an actual size arrives.
  applyWidth(card._tabContainerWidth > 0 ? card._tabContainerWidth : 900);
  if (typeof ResizeObserver !== 'function') { nav.hidden = false; label.hidden = false; }
  if (!card._tabResizeObserver && typeof ResizeObserver === 'function' && card.isConnected) {
    // While observed, JS toggles visibility after capturing focus. This avoids
    // CSS hiding the focused control before ResizeObserver can transfer it.
    card.setAttribute('data-responsive-tabs-observed', '');
    card._tabResizeObserver = new ResizeObserver(entries => {
      const entry = entries.find(item => item.target === card);
      if (!entry) return;
      card._tabContainerWidth = entry.contentRect.width;
      applyWidth(card._tabContainerWidth);
    });
    card._tabResizeObserver.observe(card);
  }
  if (restoreFocus) {
    const button = buttons.find(item => item.dataset.tab === restoreFocus.tab) || selected;
    if (nav.hidden || restoreFocus.picker && !label.hidden) select.focus({ preventScroll: true });
    else button?.focus({ preventScroll: true });
  }
}
const _RESPONSIVE_CONTROL_CSS = `
/* Host width, including Sections/sidebar placement, determines navigation. */
:host { container-type:inline-size;container-name:ha-tools-card;min-width:0; }
.card { min-width:0;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere; }
button,summary,a[href],input:not([type=checkbox]):not([type=radio]),select,textarea {
  box-sizing:border-box;min-height:44px !important;min-width:44px !important;max-width:100%;
}
button,summary,a[href] { white-space:normal;overflow-wrap:anywhere; }
a[href] { display:inline-flex;align-items:center; }
input:not([type=checkbox]):not([type=radio]),select,textarea { min-width:44px !important; }
button:focus-visible,summary:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible {
  outline:3px solid var(--primary-color,#1769aa) !important;outline-offset:2px;
}
.tabs { flex-wrap:wrap !important;overflow:visible !important;min-width:0;max-width:100%; }
.tabs button[data-tab] { min-width:44px !important;min-height:44px !important;white-space:normal !important;overflow-wrap:anywhere;max-width:100%; }
.ht-tab-picker { display:none;min-width:0;gap:6px;margin:0 0 16px; }
.ht-tab-picker select { width:100%;font:inherit;color:var(--primary-text-color,inherit);background:var(--card-background-color,transparent);padding:8px;border:1px solid var(--divider-color,#aaa);border-radius:8px; }
.tabs[hidden],.ht-tab-picker[hidden] { display:none !important; }
.donate-section[data-source="own-card"] a { min-height:44px;min-width:44px; }
.intro-banner,.tip-banner { padding-right:64px !important; }
@container ha-tools-card (width < 280px) {
  .tabs { display:none !important; }
  .ht-tab-picker:not([hidden]) { display:flex;flex-direction:column; }
}
/* Observed hosts retain their focused navigation until the width callback. */
:host([data-responsive-tabs-observed]) .tabs:not([hidden]) { display:flex !important; }
:host([data-responsive-tabs-observed]) .ht-tab-picker:not([hidden]) { display:flex;flex-direction:column; }
`;

class HAConfigAuditor extends HTMLElement {
  static getConfigElement() { return document.createElement('ha-config-auditor-editor'); }
  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12, min_rows: 3, min_columns: 6 }; }

  static getStubConfig() { return { type: 'custom:ha-config-auditor', title: 'Config Auditor' }; }
  constructor() {
    super();
    this._toolId = this.tagName.toLowerCase().replace('ha-', '');
    this.attachShadow({ mode: 'open' });
    // --- Throttle fields ---
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._firstHassRender = false;
    // --- Pagination ---
    this._currentPage = {};
    this._pageSize = 15;
    this._hass = null;
    this._config = { title: 'Config Auditor' };
    this._activeTab = 'overview';
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this._loading = true;
    this._auditData = null;
    this._lastScan = null;
    this._lastHtml = '';
    this._lastAuditTime = 0;
    this._auditEpoch = 0;
    this._reportEpoch = 0;
    this._reportContext = null;
    this._savedReports = [];
    this._reportsLoaded = false;
    this._privateReportCounts = new Map();
    this._reportCurrent = '';
    this._reportBaseline = '';
    this._reportNotice = '';
    this._reportConnectionActive = true;
    this._reportConnection = null;
    this._reportConnectionOff = null;
    this._exportDialog = null;
    this._pendingExport = null;
    this._reportBrowserOnline = navigator.onLine !== false;
    this._reportBrowserOff = null;
    this._reportClearArmed = false;
  }

  _reportsKey() {
    // Account ID is a local storage namespace reference, never a report field or export.
    const user = this._hass?.user;
    if (user?.is_admin !== true || typeof user.id !== 'string' || !user.id) return null;
    return 'ha-config-auditor:manual-reports:v1:' + encodeURIComponent(user.id) + ':' + encodeURIComponent(String(this._config?.storage_key || 'default'));
  }

  connectedCallback() {
    this._reportBrowserOff?.();
    this._reportBrowserOnline = navigator.onLine !== false;
    const changed = online => {
      this._reportBrowserOnline = online;
      this._reportSourceEpoch = (this._reportSourceEpoch || 0) + 1;
      this._auditEpoch++;
      this._invalidateReportContext();
      this._exportDialog?.cancel();
      this._reportContext = null;
      this._auditData = null;
      this._loading = false;
      this._firstHassRender = false;
      if (this._hass?.connection && typeof this._hass.connection === 'object') reportConnections.set(this._hass.connection, reportToken());
      if (online) this._setReportIdentity();
      this._updateContent();
    };
    const offline = () => changed(false), online = () => changed(navigator.onLine !== false);
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    this._reportBrowserOff = () => { window.removeEventListener('offline', offline); window.removeEventListener('online', online); };
  }

  _clearManualReports(confirmed = false) {
    if (!this.isConnected || this._hass?.user?.is_admin !== true || !this._reportContext || !this._reportConnectionActive || !this._reportBrowserOnline || this._hass.connection?.connected === false || this._pendingExport) return;
    if (!confirmed) { this._reportClearArmed = true; this._updateReportControls(); return; }
    if (!this._reportClearArmed) return;
    try {
      const key = this._reportsKey();
      if (!key) return;
      localStorage.removeItem(key);
      if (localStorage.getItem(key) !== null) throw new Error('local_report_clear_unconfirmed');
      this._invalidateReportContext();
      this._savedReports = [];
      this._reportCurrent = this._reportBaseline = '';
      this._reportNotice = 'cleared';
    } catch { this._reportNotice = 'storage_error'; }
    this._reportClearArmed = false;
    this._updateReportControls();
    const clear = this.shadowRoot.querySelector('.report-clear');
    (clear && !clear.disabled ? clear : this.shadowRoot.querySelector('.report-save'))?.focus();
  }

  _invalidateReportContext() {
    this._reportEpoch++;
    this._reportClearArmed = false;
    this._privateReportCounts?.clear();
    this._exportDialog?.contextChanged();
  }

  _normalizeReportSource(value) {
    const ref = v => typeof v === 'string' && /^c-[a-f0-9]{32}$/.test(v);
    if (!value || value.schema !== 1 || value.source !== 'core_uuid_readonly' || value.confirmed !== true || !['instance','owner','scope'].every(k => ref(value[k]))) return null;
    return {schema:1,source:'core_uuid_readonly',confirmed:true,instance:value.instance,owner:value.owner,scope:value.scope};
  }

  _setReportIdentity() {
    const h = this._hass;
    if (h?.user?.is_admin !== true || typeof h.user.id !== 'string' || !h.user.id || !h.connection || !this._reportBrowserOnline || !this._reportConnectionActive || h.connection.connected === false) {
      this._reportContext = null; return;
    }
    const source = this._normalizeReportSource(this._auditData?.reportSource);
    if (source) { this._reportContext = {owner:source.owner,instance:source.instance,scope:source.scope,source:'core_uuid_readonly'}; return; }
    const owner = this._reportOwnerToken || (this._reportOwnerToken = reportToken());
    const instance = opaqueMapped(reportConnections, h.connection);
    const scope = this._reportScopeToken || (this._reportScopeToken = reportToken());
    this._reportContext = owner && instance && scope ? {owner,instance,scope,source:'browser_session'} : null;
  }

  _bindReportConnection(connection) {
    if (this._reportConnection === connection) return;
    this._reportConnectionOff?.();
    this._reportConnectionOff = null;
    this._reportConnection = connection || null;
    this._reportConnectionActive = connection?.connected !== false;
    if (typeof connection?.addEventListener !== 'function') return;
    const changed = () => {
      this._reportSourceEpoch = (this._reportSourceEpoch || 0) + 1;
      this._auditEpoch++;
      this._invalidateReportContext();
      this._exportDialog?.cancel();
      this._reportConnectionActive = connection.connected !== false;
      reportConnections.set(connection, reportToken());
      this._reportContext = null;
      this._auditData = null;
      this._loading = false;
      this._firstHassRender = false;
      this._setReportIdentity();
      this._updateContent();
    };
    const disconnected = () => {
      changed();
      this._reportConnectionActive = false;
      this._reportContext = null;
      this._updateReportControls();
    };
    connection.addEventListener('disconnected', disconnected);
    connection.addEventListener('ready', changed);
    this._reportConnectionOff = () => {
      connection.removeEventListener?.('disconnected', disconnected);
      connection.removeEventListener?.('ready', changed);
    };
  }

  _loadManualReports() {
    if (this._hass?.user?.is_admin !== true || !this._reportsKey()) return;
    this._reportsLoaded = true;
    try { this._savedReports = configReports.load(localStorage.getItem(this._reportsKey())); }
    catch { this._savedReports = []; this._reportNotice = 'storage_error'; }
  }

  _saveManualReport() {
    if (!this.isConnected || this._hass?.user?.is_admin !== true || this._loading || !this._reportContext || !this._reportBrowserOnline || !this._reportConnectionActive || this._hass.connection?.connected === false || !this._auditData || this._auditData.error || !Number.isFinite(this._lastScan?.getTime())) return;
    const id = reportToken('r-');
    const report = configReports.snapshot(this._auditData, {id,timestamp:this._lastScan.toISOString(),context:this._reportContext});
    if (!report) { this._reportNotice = 'identity_unconfirmed'; this._updateReportControls(); return; }
    try {
      // Read/merge only our new namespace at the explicit Save gesture. Existing
      // scan, intro, support and unrelated storage keys are untouched.
      const reports = configReports.retain([report, ...configReports.load(localStorage.getItem(this._reportsKey())), ...this._savedReports]);
      localStorage.setItem(this._reportsKey(), JSON.stringify({schema:configReports.schema,reports}));
      this._invalidateReportContext();
      this._savedReports = reports;
      this._privateReportCounts.set(id, configReports.privateCounts(this._auditData));
      this._reportCurrent = id;
      this._reportNotice = 'saved';
    } catch { this._reportNotice = 'storage_error'; }
    this._updateReportControls();
  }

  _selectedReport() { return this._savedReports.find(r => r.id === this._reportCurrent) || null; }
  _selectedComparison() {
    const before = this._savedReports.find(r => r.id === this._reportBaseline), after = this._selectedReport();
    if (!before || !after) return null;
    if (before.id === after.id) return {compatible:false,reason:'select_two_saved_reports',checks:[]};
    if (!this._reportContext || before.context?.instance !== this._reportContext.instance || after.context?.instance !== this._reportContext.instance) return {compatible:false,reason:this._reportContext?.source==='core_uuid_readonly' && before.context?.source==='core_uuid_readonly' && after.context?.source==='core_uuid_readonly' ? 'instance_changed' : 'instance_or_session_unconfirmed',checks:[]};
    if (before.context?.owner !== this._reportContext.owner || after.context?.owner !== this._reportContext.owner) return {compatible:false,reason:'user_changed',checks:[]};
    if (before.context?.scope !== this._reportContext.scope || after.context?.scope !== this._reportContext.scope) return {compatible:false,reason:'scope_changed',checks:[]};
    return configReports.compare(before,after);
  }

  _reportExportContext() {
    const report = this._selectedReport(), context = this._reportContext;
    return {role:this._hass?.user?.is_admin === true?'admin':'household',userId:context?.owner||'unconfirmed-owner',connectionId:context?.instance||'unconfirmed-connection',datasetId:report?.id||'no-report',revision:this._reportEpoch,connected:this.isConnected && this._reportBrowserOnline && this._reportConnectionActive && this._hass?.connection?.connected !== false,canExport:this._hass?.user?.is_admin === true && !!report && !this._loading && !!context,sourceConfirmed:!!report && !!configReports.clean(report)};
  }

  _openReportExport(opener) {
    const context = this._reportExportContext();
    if (!context.canExport || !context.connected || !context.sourceConfirmed) return;
    if (!this._exportDialog) this._exportDialog = createExportDialog({
      root:this.shadowRoot,getContext:()=>this._reportExportContext(),getLanguage:()=>this._lang,createUiV3,
      policy:{id:'config-reviewed-report-v1',allowlistedFields:['schema','method','reportTimestamp','auditTimestamp','source','scope','serverVersion','status','counts','limits','checks.id','checks.category','checks.status','checks.severity','comparison','privateInventory.addons','privateInventory.integrations','privateInventory.entities'],neverInclude:['tokens','users','addresses','raw_config','names','entity_names','raw_descriptions','integration_payloads']},
      formats:['json','csv','txt'],defaultFormat:'json',defaultFilename:'config-audit-report.json',
      buildPayload:({draft,signal})=>{
        if (signal.aborted) throw new Error('Export cancelled');
        const report = this._selectedReport();
        const L = configReports.labels[this._lang];
        const serialized = configReports.serialize(report,{format:draft.format,includePrivate:draft.includePrivate,privateCounts:this._privateReportCounts.get(report.id),language:this._lang,comparison:this._selectedComparison()});
        return {serialized,confirmed:true,sourceConfirmed:true,status:report.status,included:[this._lang==='pl'?'Czas audytu, zakres, źródło, ograniczenia, stany i liczby jawnych kontroli':'Audit time, scope, source, limitations, explicit check states and counts', ...(draft.includePrivate?[L.private]:[])],excluded:[this._lang==='pl'?'Tokeny, konta użytkowników, nazwy, adresy, surowa konfiguracja, opisy i dane integracji':'Tokens, user accounts, names, addresses, raw configuration, descriptions and integration payloads',...(draft.includePrivate?[]:[this._lang==='pl'?'Prywatne liczby inwentarza':'Private inventory counts'])],sourceLimit:L.limits};
      },
      performDownload:async args=>{
        const intent = {};
        this._pendingExport = intent;
        try { return await this._downloadReport(args); }
        finally { if(this._pendingExport===intent)this._pendingExport=null; }
      },
    });
    this._exportDialog.open({opener});
  }

  async _downloadReport({blob,filename,signal}) {
    if (signal.aborted) return {outcome:'unknown'};
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.hidden = true;
    this.shadowRoot.append(anchor);
    try { if(signal.aborted)return {outcome:'unknown'};anchor.click();return {outcome:'initiated'}; }
    finally { anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),0); }
  }

  _updateReportControls() {
    if (this._hass?.user?.is_admin !== true) return;
    const root = this.shadowRoot.getElementById('report-tools');
    if (!root) return;
    const pl = this._lang === 'pl', ui = createUiV3({language:this._lang});
    const L = pl ? {
      title:'Raporty audytu',identity:'Potwierdzenie źródła',identity_known:'Bieżący audyt potwierdził źródło HA i konto. Porównanie jest możliwe dla raportów o potwierdzonym wspólnym źródle, tej samej metodzie, wersji i zakresie.',identity_unknown:'Trwała tożsamość źródła lub konta jest niepotwierdzona. Po przeładowaniu porównanie pozostaje niedostępne.',save:'Zapisz raport',export:'Eksportuj wybrany raport',baseline:'Wcześniejszy zapis',current:'Bieżący zapis',choose:'Wybierz zapis ręcznie',time:'Czas audytu',state:'Stan',checks:'Kontrole',local:'Raporty są zapisane tylko w tej przeglądarce dla tego konta i zakresu karty w danym origin. Retencja: maks. 20 zapisów z ostatnich 30 dni. Starsze zapisy są pomijane przy odczycie i usuwane przy następnym ręcznym zapisie. Zapis jest ręczny; nie przechowuje surowych wyników ani danych użytkowników.',empty:'Brak zapisanych raportów',identity_unconfirmed:'Tożsamość użytkownika lub połączenia niepotwierdzona; zapis niedostępny.',storage_error:'Nie udało się potwierdzić zapisu w przeglądarce.',saved:'Raport zapisany lokalnie.',clear:'Wyczyść zapisane raporty',clear_confirm:'Potwierdź usunięcie',clear_cancel:'Anuluj usunięcie',clear_prompt:'Usunąć wszystkie lokalne raporty tego konta i tej karty? Inne zapisy pozostaną.',cleared:'Lokalne raporty tego konta i karty zostały usunięte.',new:'Nowe',still_present:'Nadal obecne',resolved:'Rozwiązane',unknown:'Nieznane / nie sprawdzono',unchanged:'Bez zmian',select_two_saved_reports:'Wybierz dwa różne zapisane raporty.',schema_changed:'Nieporównywalne: zmiana wersji schematu.',method_changed:'Nieporównywalne: zmiana metody.',scope_changed:'Nieporównywalne: inny zakres.',user_changed:'Nieporównywalne: inny użytkownik.',instance_changed:'Nieporównywalne: inna instancja HA.',instance_or_session_unconfirmed:'Nieporównywalne: tożsamość instancji HA / sesji niepotwierdzona po przeładowaniu lub zmianie połączenia.',integration_version_changed:'Nieporównywalne: zmiana wersji integracji.',baseline_is_newer:'Nieporównywalne: wcześniejszy zapis jest nowszy od bieżącego.'
    } : {
      title:'Audit reports',identity:'Source confirmation',identity_known:'The current audit confirmed the HA source and account. Reports with confirmed matching sources, method, version and scope can be compared.',identity_unknown:'Persistent source or account identity is unconfirmed. Comparison after reload remains unavailable.',save:'Save report',export:'Export selected report',baseline:'Earlier saved report',current:'Current saved report',choose:'Choose a saved report manually',time:'Audit time',state:'Status',checks:'Checks',local:'Reports are stored only in this browser for this account and card scope on this origin. Retention: at most 20 reports from the last 30 days. Older records are ignored on read and removed on the next manual save. Saving is manual; raw findings and user data are excluded.',empty:'No saved reports',identity_unconfirmed:'User or connection identity unconfirmed; saving unavailable.',storage_error:'Browser storage save could not be confirmed.',saved:'Report saved locally.',clear:'Clear saved reports',clear_confirm:'Confirm deletion',clear_cancel:'Cancel deletion',clear_prompt:'Delete all local reports for this account and card? Other saved data remains.',cleared:'Local reports for this account and card were removed.',new:'New',still_present:'Still present',resolved:'Resolved',unknown:'Unknown / not checked',unchanged:'Unchanged',select_two_saved_reports:'Select two different saved reports.',schema_changed:'Incompatible: schema version changed.',method_changed:'Incompatible: method changed.',scope_changed:'Incompatible: scope changed.',user_changed:'Incompatible: user changed.',instance_changed:'Incompatible: a different HA instance.',instance_or_session_unconfirmed:'Incompatible: HA instance / session identity is unconfirmed after reload or connection change.',integration_version_changed:'Incompatible: integration version changed.',baseline_is_newer:'Incompatible: baseline is newer than current report.'
    };
    const focused = root.contains(this.shadowRoot.activeElement) ? this.shadowRoot.activeElement.className : null;
    this._savedReports = configReports.retain(this._savedReports);
    const canSave = !this._loading && !!this._auditData?.findings && !this._auditData.error && Number.isFinite(this._lastScan?.getTime()) && !!this._reportContext && this._reportBrowserOnline && this._reportConnectionActive && this._hass.connection?.connected !== false;
    const options = selected => `<option value="">${_esc(L.choose)}</option>`+this._savedReports.map((r,i)=>`<option value="${r.id}" ${selected===r.id?'selected':''}>${_esc(r.timestamp)} · ${_esc(ui.status(r.status).label)} · ${i+1}</option>`).join('');
    const selected = this._selectedReport(), comparison = this._selectedComparison();
    const confirmedSource = !!this._normalizeReportSource(this._auditData?.reportSource);
    let details = `<p>${_esc(L.identity)}: ${ui.statusHtml(confirmedSource?'success':'unconfirmed')}</p><p>${_esc(confirmedSource?L.identity_known:L.identity_unknown)}</p>` + (selected ? `${ui.statusHtml(selected.status)}<p>${_esc(configReports.labels[this._lang].limits)}</p>` : '');
    if(comparison) {
      if(!comparison.compatible) details += `${ui.statusHtml('unconfirmed')}<p>${_esc(L[comparison.reason]||L.identity_unconfirmed)}</p>`;
      else details += `<table><thead><tr><th>${_esc(L.checks)}</th><th>${_esc(L.state)}</th></tr></thead><tbody>${comparison.checks.filter(c=>c.change!=='unchanged').map(c=>`<tr><td data-label="${_esc(L.checks)}">${_esc(c.id)}</td><td data-label="${_esc(L.state)}">${_esc(L[c.change])} ${ui.statusHtml(c.status)}</td></tr>`).join('')}</tbody></table>`;
    }
    root.innerHTML = `<h3>${_esc(L.title)}</h3><p>${_esc(L.local)}</p><div class="report-actions"><button type="button" class="report-save" ${canSave?'':'disabled'}>${_esc(L.save)}</button><button type="button" class="report-export" ${selected&&this._reportExportContext().canExport?'':'disabled'}>${_esc(L.export)}</button><button type="button" class="report-clear" ${this._savedReports.length&&this._reportContext&&!this._pendingExport?'':'disabled'}>${_esc(L.clear)}</button></div>${this._reportClearArmed ? `<div class="report-actions" role="group" aria-label="${_esc(L.clear_prompt)}"><p>${_esc(L.clear_prompt)}</p><button type="button" class="report-clear-confirm">${_esc(L.clear_confirm)}</button><button type="button" class="report-clear-cancel">${_esc(L.clear_cancel)}</button></div>` : ''}<p role="status" aria-live="polite">${_esc(L[this._reportNotice] || (!this._reportContext?L.identity_unconfirmed:''))}</p><div class="report-choices"><label>${_esc(L.baseline)}<select class="report-baseline">${options(this._reportBaseline)}</select></label><label>${_esc(L.current)}<select class="report-current">${options(this._reportCurrent)}</select></label></div>${this._savedReports.length?'':`<p>${_esc(L.empty)}</p>`}${details}`;
    root.querySelector('.report-save').addEventListener('click',()=>this._saveManualReport());
    root.querySelector('.report-export').addEventListener('click',event=>this._openReportExport(event.currentTarget));
    root.querySelector('.report-clear').addEventListener('click',()=>this._clearManualReports());
    root.querySelector('.report-clear-confirm')?.addEventListener('click',()=>this._clearManualReports(true));
    root.querySelector('.report-clear-cancel')?.addEventListener('click',()=>{this._reportClearArmed=false;this._updateReportControls();root.querySelector('.report-clear')?.focus();});
    root.onkeydown = event => { if (event.key === 'Escape' && this._reportClearArmed) { event.preventDefault();this._reportClearArmed=false;this._updateReportControls();root.querySelector('.report-clear')?.focus(); } };
    for(const [key,field]of [['baseline','_reportBaseline'],['current','_reportCurrent']])root.querySelector('.report-'+key).addEventListener('change',event=>{
      this._invalidateReportContext();
      this[field]=event.currentTarget.value;
      this._updateReportControls();
    });
    if(focused && ['report-save','report-export','report-current','report-baseline','report-clear','report-clear-confirm','report-clear-cancel'].includes(focused))root.querySelector('.'+focused)?.focus();
  }

  // -- Persistence --
  _scKey() { return 'ha-config-auditor-' + (this._config?.storage_key || 'default'); }
  _saveScanData() {
    try {
      const data = { lastScan: this._lastScan ? this._lastScan.toISOString() : null };
      localStorage.setItem(this._scKey(), JSON.stringify(data));
    } catch(e) { console.debug('[config-auditor]', e.message); }
  }
  _loadScanData() {
    try {
      const raw = localStorage.getItem(this._scKey());
      if (raw) {
        const data = JSON.parse(raw);
        if (data.lastScan) this._lastScan = new Date(data.lastScan);
      }
    } catch(e) { console.debug('[config-auditor]', e.message); }
  }

  set hass(hass) {
    try {
      var _bg = (getComputedStyle(this).getPropertyValue('--card-background-color') || getComputedStyle(this).getPropertyValue('--primary-background-color') || '').trim();
      var _d = false;
      if (_bg) {
        var _h, _r, _g, _b, _m;
        if (_bg.charAt(0) === '#') { _h = _bg.slice(1); if (_h.length === 3) _h = _h.replace(/(.)/g, '$1$1'); _r = parseInt(_h.slice(0,2),16); _g = parseInt(_h.slice(2,4),16); _b = parseInt(_h.slice(4,6),16); }
        else { _m = _bg.match(/[\d.]+/g); if (_m) { _r = +_m[0]; _g = +_m[1]; _b = +_m[2]; } }
        if (_r != null) _d = (0.2126*_r + 0.7152*_g + 0.0722*_b) / 255 < 0.5;
      } else if (hass && hass.themes) { _d = !!hass.themes.darkMode; }
      this.classList.toggle('bento-dark', _d);
    } catch (e) {}
    try {
      const previousLanguage = this._lang;
      const oldConnection = this._hass?.connection;
      this._hass = hass;
      const connectionChanged = oldConnection !== hass?.connection;
      const offline = !this._reportBrowserOnline || hass?.connection?.connected === false;
      const availabilityChanged = this._reportWasOffline !== undefined && this._reportWasOffline !== offline;
      this._reportWasOffline = offline;
      if (connectionChanged || availabilityChanged) {
        this._reportSourceEpoch = (this._reportSourceEpoch || 0) + 1;
        this._invalidateReportContext();
        this._reportContext = null;
        if (hass?.connection && typeof hass.connection === 'object') reportConnections.set(hass.connection, reportToken());
      }
      this._bindReportConnection(hass?.connection);
      this._lang = (hass?.language || navigator.language || '').startsWith('pl') ? 'pl' : 'en';
      const authorityChanged = this._authorityAdmin !== hass?.user?.is_admin || this._authorityUserId !== hass?.user?.id;
      if (authorityChanged) { this._invalidateReportContext(); this._reportOwnerToken = null; this._reportContext = null; }
      this._authorityAdmin = hass?.user?.is_admin;
      this._authorityUserId = hass?.user?.id;
      if (authorityChanged || connectionChanged || availabilityChanged || offline || hass?.user?.is_admin !== true) {
        this._auditEpoch++;
        this._auditData = null;
        this._loading = false;
        this._firstHassRender = false;
        this._lastHtml = '';
        this._currentPage = {};
      }
      if (!this._config) this._config = { title: 'Config Auditor' };
      if (hass?.user?.is_admin !== true) {
        this._exportDialog?.cancel();
        this._reportContext = null;
        this._reportOwnerToken = this._reportScopeToken = null;
        this._savedReports = [];
        this._reportsLoaded = false;
        this._privateReportCounts.clear();
        this._reportCurrent = this._reportBaseline = '';
        this._reportNotice = '';
        this._render(); return;
      }
      if (offline) { this._loading = false; this._render(); this._updateContent(); return; }
      if (authorityChanged || connectionChanged || availabilityChanged || !this._reportContext) this._setReportIdentity();
      if (authorityChanged || connectionChanged || availabilityChanged || !this._reportsLoaded) this._loadManualReports();
      const now = Date.now();
      if (!this._firstHassRender) {
        this._firstHassRender = true;
        this._lastAuditTime = now;
        this._runAudit();
        this._render();
        this._lastRenderTime = now;
        return;
      }
      // Configuration best-practices audit is expensive — only re-run every 5 minutes
      if (now - (this._lastAuditTime || 0) > 300000) {
        this._lastAuditTime = now;
        this._runAudit();
      }
      if (previousLanguage !== this._lang) this._updateLocale();
      // Throttle render to 60s — audit results are static
      if (now - (this._lastRenderTime || 0) < 60000) {
        return;
      }
      this._lastRenderTime = now;
    } catch(e) {
      this._renderError(e);
    }
  }


  get _t() {
    const T = {
      pl: {
        title: 'Audyt konfiguracji',
        loading: 'Wczytywanie...',
        noData: 'Brak danych',
        error: 'Błąd',
        refresh: 'Odśwież',
        save: 'Zapisz',
        cancel: 'Anuluj',
        locale: 'pl-PL',
        adminRequired: 'Audyt konfiguracji wymaga uprawnień administratora.',
      },
      en: {
        title: 'Config Auditor',
        loading: 'Loading...',
        noData: 'No data',
        error: 'Error',
        refresh: 'Refresh',
        save: 'Save',
        cancel: 'Cancel',
        locale: 'en-US',
        adminRequired: 'Configuration audit requires administrator permissions.',
      },
    };
    return T[this._lang] || T.en;
  }

  _msg(value) {
    const text = String(value == null ? '' : value);
    if (this._lang !== 'pl') return text;
    if (Object.hasOwn(AUDIT_COPY_PL, text)) return AUDIT_COPY_PL[text];
    for (const [pattern, translated] of AUDIT_COPY_PATTERNS) {
      const match = text.match(pattern);
      if (match) return translated.replace(/\{(\d+)\}/g, (_, index) => match[Number(index) + 1]);
    }
    return text;
  }

  _translateContent(content) {
    if (this._lang !== 'pl') return;
    // Data cells and authored/finding values are rendered separately, never translated as UI labels.
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement.closest('td, [data-audit-value]')) continue;
      const match = node.textContent.match(/^(\s*(?:[\p{Extended_Pictographic}\uFE0F]\s*)*)(.*?)(\s*)$/u);
      if (match) node.textContent = match[1] + this._msg(match[2]) + match[3];
    }
    for (const node of content.querySelectorAll('[title]')) node.title = this._msg(node.title);
  }

  _updateLocale() {
    this._invalidateReportContext();
    this._updateReportControls();
    const labels = { overview: 'Overview', critical: 'Findings', addons: 'Addons & Integrations', network: 'Network', users: 'Users', tips: 'Tips' };
    this.shadowRoot.querySelectorAll('[role="tab"]').forEach(tab => { tab.textContent = this._msg(labels[tab.dataset.tab]); });
    _bindResponsiveTabs(this);
    const refresh = this.shadowRoot.querySelector('.audit-refresh');
    if (refresh) refresh.textContent = this._t.refresh;
    const intro = this._lang === 'pl' ? _LOCAL_INTRO_PL : _LOCAL_INTRO;
    const banner = this.shadowRoot.querySelector('.intro-banner[data-intro="ha-config-auditor"]');
    if (banner) {
      banner.querySelector('.intro-headline').textContent = '💡 ' + intro.headline;
      banner.querySelectorAll('.intro-steps li').forEach((item, index) => { item.textContent = intro.steps[index]; });
      const dismiss = this._lang === 'pl' ? 'Ukryj instrukcję' : 'Dismiss';
      const button = banner.querySelector('.intro-dismiss');
      button.title = dismiss;
      button.setAttribute('aria-label', dismiss);
    }
    const support = this.shadowRoot.querySelector('.donate-section[data-source="own-card"]');
    if (support) {
      support.querySelector('a').textContent = this._lang === 'pl' ? 'Dobrowolne wsparcie HA Tools' : 'Optional support for HA Tools';
      support.querySelector('.support-dismiss').setAttribute('aria-label', this._lang === 'pl' ? 'Ukryj link wsparcia' : 'Dismiss support link');
    }
    this._updateContent();
  }

  setConfig(config) {
    const cfg = config || {};
    this._invalidateReportContext();
    const scopeChanged = String(this._config?.storage_key || 'default') !== String(cfg.storage_key || 'default');
    if (scopeChanged) { this._reportScopeToken = null; this._savedReports = []; this._reportCurrent = this._reportBaseline = ''; this._reportsLoaded = false; }
    this._config = { title: cfg.title || 'Config Auditor', ...cfg };
    if (this._hass?.user?.is_admin !== false) this._loadScanData();
    if (this._hass?.user?.is_admin === true) { this._setReportIdentity(); if (scopeChanged) this._loadManualReports(); }
    if (this._hass) { this._lastHtml = ''; this._render(); }
  }

  // HTML escape — protects against XSS when interpolating user-controllable strings into innerHTML.
  // (Was previously a Unicode normalize hack via decodeURIComponent(escape(...)) — not XSS-safe.)
  _sanitize(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  _renderError(error) {
    const message = error?.message || String(error || 'Unknown render error');
    this._invalidateReportContext();
    this._exportDialog?.cancel();
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .error {
          padding: 16px;
          border: 1px solid var(--error-color, #ef4444);
          border-radius: 8px;
          color: var(--primary-text-color, #111827);
          background: var(--card-background-color, #fff);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        code { color: var(--error-color, #ef4444); }
      </style>
      <div class="error">
        <strong>Config Auditor could not render.</strong><br>
        <code>${_esc(message)}</code>
      </div>
    `;
  }

  async _runAudit() {
    if (!this._reportBrowserOnline) return;
    if (this._hass?.user?.is_admin !== true) return;
    const auditHass = this._hass;
    const auditUserId = auditHass.user.id;
    const requestWS = auditHass.callWS.bind(auditHass);
    this._invalidateReportContext();
    const auditConnection = auditHass.connection;
    const sourceEpoch = this._reportSourceEpoch || 0;
    const epoch = ++this._auditEpoch;
    const isCurrent = () => sourceEpoch === (this._reportSourceEpoch || 0) && this._hass?.connection === auditConnection && this._reportBrowserOnline && this._reportConnectionActive && auditConnection?.connected !== false && epoch === this._auditEpoch && this._hass?.user?.is_admin === true && this._hass.user.id === auditUserId;
    const callWS = async message => {
      if (!isCurrent()) throw new Error('Audit authority changed');
      const response = await requestWS(message);
      if (!isCurrent()) throw new Error('Audit authority changed');
      return response;
    };
    this._loading = true;
    this._updateContent();

    const checks = [];
    const findings = { critical: [], warning: [], info: [], pass: [] };
    let serverVersion = null;
    let reportSource = null;

    try {
      let hostInfo = null, osInfo = null, supervisorInfo = null, coreInfo = null;
      try { const r = await callWS({ type: 'supervisor/api', endpoint: '/host/info', method: 'get' }); hostInfo = r?.data || r; } catch(e) { console.debug('[config-auditor]', e.message); }
      try { const r = await callWS({ type: 'supervisor/api', endpoint: '/os/info', method: 'get' }); osInfo = r?.data || r; } catch(e) { console.debug('[config-auditor]', e.message); }
      try { const r = await callWS({ type: 'supervisor/api', endpoint: '/supervisor/info', method: 'get' }); supervisorInfo = r?.data || r; } catch(e) { console.debug('[config-auditor]', e.message); }
      try { const r = await callWS({ type: 'supervisor/api', endpoint: '/core/info', method: 'get' }); coreInfo = r?.data || r; } catch(e) { console.debug('[config-auditor]', e.message); }

      // Detect non-supervised HA installation
      if (!hostInfo && !osInfo && !supervisorInfo && !coreInfo) {
        findings.info.push({ id: 'no_supervisor', title: 'Supervisor API unavailable', desc: 'System updates, add-ons and Supervisor network checks were not run. The installation type or account permissions may explain this.', fix: 'Check installation type and account permissions' });
      }

      if (coreInfo) {
        const current = coreInfo.version;
        const latest = coreInfo.version_latest;
        if (current && latest && current !== latest) {
          findings.warning.push({ id: 'core_update', title: 'HA Core update available', desc: `Current: ${current} \u2192 Latest: ${latest}`, fix: 'Update via Settings \u2192 System \u2192 Updates' });
        } else if (current && latest && current === latest) {
          findings.pass.push({ id: 'core_update', title: 'HA Core is up to date', desc: `Version: ${current}` });
        } else if (current) {
          findings.info.push({ id: 'core_update', title: 'HA Core update status not checked', desc: `Current version: ${current}; latest version unavailable` });
        }
      }

      if (supervisorInfo) {
        if (supervisorInfo.version && supervisorInfo.version_latest && supervisorInfo.version !== supervisorInfo.version_latest) {
          findings.warning.push({ id: 'supervisor_update', title: 'Supervisor update available', desc: `Current: ${supervisorInfo.version} \u2192 Latest: ${supervisorInfo.version_latest}`, fix: 'Update the Supervisor from System settings' });
        } else if (supervisorInfo.version && supervisorInfo.version_latest) {
          findings.pass.push({ id: 'supervisor_update', title: 'Supervisor is up to date', desc: `Version: ${supervisorInfo.version}` });
        } else {
          findings.info.push({ id: 'supervisor_update', title: 'Supervisor update status not checked', desc: 'Version comparison data is incomplete.' });
        }
      }

      const osVersion = osInfo?.version;
      const validOsVersion = typeof osVersion === 'string' && /^\d+(?:\.[\da-z]+)+(?:[-+][\w.-]+)?$/i.test(osVersion);
      const osUpdateAvailable = osInfo?.update_available;
      if (validOsVersion && osUpdateAvailable === true) {
        const latest = typeof osInfo.version_latest === 'string' ? osInfo.version_latest : this._msg('Not checked');
        findings.warning.push({ id: 'os_update', title: 'OS update available', desc: `Current: ${osVersion} → Latest: ${latest}`, fix: 'Update via Settings → System → Updates' });
      } else if (validOsVersion && osUpdateAvailable === false) {
        findings.pass.push({ id: 'os_update', resultState: 'success', title: 'HA OS is up to date', desc: `Version: ${osVersion}` });
      } else {
        findings.info.push({ id: 'os_update', resultState: 'not_checked', verified: false, title: 'HA OS update status not checked', desc: 'OS update metadata is incomplete or invalid.' });
      }

      let addons = [];
      let addonsAvailable = false;
      try {
        const addonList = await callWS({ type: 'supervisor/api', endpoint: '/addons', method: 'get' });
        const inventory = addonList?.addons ?? addonList?.data?.addons;
        addonsAvailable = Array.isArray(inventory);
        addons = addonsAvailable ? inventory : [];
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // /addons lists installed add-ons without an `installed` flag.
      const installedAddons = addons.filter(a => a.installed !== false);

      const outdatedAddons = installedAddons.filter(a => a.update_available);
      if (outdatedAddons.length > 0) {
        findings.warning.push({ id: 'addon_updates', title: `${outdatedAddons.length} addon(s) have updates`, desc: outdatedAddons.map(a => `${(a.name)}: ${a.version} \u2192 ${a.version_latest}`).join(', '), fix: 'Update addons via Settings \u2192 Add-ons' });
      } else if (installedAddons.length > 0) {
        findings.pass.push({ id: 'addon_updates', title: 'All addons up to date', desc: `${installedAddons.length} addon(s) installed` });
      }

      const hostNetAddons = installedAddons.filter(a => a.host_network);
      if (hostNetAddons.length > 0) {
        findings.info.push({ id: 'host_network', title: `${hostNetAddons.length} addon(s) use host networking`, desc: hostNetAddons.map(a => (a.name)).join(', '), fix: 'Verify these addons require host network access' });
      }

      const unprotectedAddons = installedAddons.filter(a => a.protected === false);
      if (unprotectedAddons.length > 0) {
        findings.critical.push({ id: 'unprotected_addons', title: `${unprotectedAddons.length} addon(s) with protection disabled`, desc: unprotectedAddons.map(a => (a.name)).join(', '), fix: 'Enable protection mode in addon settings unless you specifically need it disabled' });
      }

      const noAutoUpdate = installedAddons.filter(a => a.auto_update === false);
      if (noAutoUpdate.length > 3) {
        findings.info.push({ id: 'auto_update', title: `${noAutoUpdate.length} addon(s) without auto-update`, desc: noAutoUpdate.map(a => (a.name)).join(', '), fix: 'Consider enabling auto-update for non-critical addons' });
      }

      const configEntries = auditHass.config;
      const externalUrl = configEntries?.external_url || '';
      if (externalUrl) {
        if (externalUrl.startsWith('https://')) {
          findings.info.push({ id: 'ssl_external', title: 'External URL is configured for HTTPS', desc: `Configured URL: ${externalUrl}. The remote endpoint and certificate were not tested.` });
        } else if (externalUrl.startsWith('http://')) {
          findings.warning.push({ id: 'ssl_external', title: 'External URL is configured for HTTP', desc: `Configured URL: ${externalUrl}. Remote reachability was not tested.`, fix: 'If this URL is reachable outside your trusted network, configure HTTPS.' });
        }
      } else {
        findings.info.push({ id: 'ssl_external', title: 'No external URL configured', desc: 'Remote reachability was not tested.', fix: 'Review remote access separately if you use it.' });
      }

      const internalUrl = configEntries?.internal_url || '';
      if (internalUrl && internalUrl.startsWith('https://')) {
        findings.info.push({ id: 'ssl_internal', title: 'Internal URL is configured for HTTPS', desc: `Configured URL: ${internalUrl}. The certificate was not tested.` });
      }

      // K1: Certificate & DNS best-practice checks
      if (externalUrl && externalUrl.startsWith('https://')) {
        try {
          const hostname = new URL(externalUrl).hostname;
          if (hostname.endsWith('.duckdns.org') || hostname.endsWith('.nabu.casa')) {
            findings.info.push({ id: 'ssl_cert_managed', title: 'Managed SSL provider domain detected', desc: `${hostname} is configured. Certificate status and renewal were not checked.` });
          } else {
            findings.info.push({ id: 'ssl_cert_check', title: 'Verify SSL certificate expiry', desc: `Hostname: ${hostname} — ensure your cert is auto-renewed (Let''s Encrypt, Cloudflare, etc.)`, fix: 'Use certbot with auto-renewal or a Cloudflare tunnel for hassle-free SSL' });
          }
        } catch(e) { console.debug('[config-auditor]', e.message); }
      }


      let users = [];
      let usersAvailable = false;
      try {
        const userList = await callWS({ type: 'config/auth/list' });
        if (Array.isArray(userList)) { users = userList; usersAvailable = true; }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      if (!usersAvailable) findings.info.push({ id: 'user_inventory_unavailable', title: 'User accounts not checked', desc: 'The user inventory is unavailable. Check account permissions or retry as an administrator.' });

      if (users.length > 0) {
        const activeUsers = users.filter(u => u.is_active !== false);
        findings.info.push({ id: 'user_count', title: `${activeUsers.length} active user(s)`, desc: `Total registered: ${users.length}` });

        const owners = users.filter(u => u.is_owner);
        if (owners.length > 1) {
          findings.warning.push({ id: 'multi_owner', title: `${owners.length} owner accounts detected`, desc: owners.map(u => (u.name)).join(', '), fix: 'Limit owner accounts to minimize attack surface. Demote unnecessary owners to admin.' });
        }

        const localOnly = users.filter(u => u.local_only);
        if (localOnly.length > 0) {
          findings.pass.push({ id: 'local_only_users', title: `${localOnly.length} user(s) restricted to local access`, desc: localOnly.map(u => (u.name)).join(', ') });
        }
      }

      const states = auditHass.states;
      const allEntities = Object.keys(states || {});

      const shellEntities = allEntities.filter(e => e.startsWith('shell_command.'));
      if (shellEntities.length > 0) {
        findings.info.push({ id: 'shell_commands', title: `${shellEntities.length} shell command(s) configured`, desc: shellEntities.slice(0, 5).join(', ') + (shellEntities.length > 5 ? '...' : ''), fix: 'Ensure shell commands don\'t execute untrusted input' });
      }

      const sshAddon = installedAddons.find(a => a.slug?.includes('ssh') || a.name?.toLowerCase().includes('ssh'));
      if (sshAddon) {
        if (sshAddon.state === 'started') {
          findings.warning.push({ id: 'ssh_addon', title: 'SSH addon is running', desc: `${(sshAddon.name)} (${sshAddon.version})`, fix: 'Ensure SSH uses key-based auth. Disable if not actively needed.' });
        } else {
          findings.info.push({ id: 'ssh_addon', title: 'SSH addon installed but stopped', desc: (sshAddon.name) });
        }
      }

      const mqttAddon = installedAddons.find(a => a.slug?.includes('mosquitto') || a.name?.toLowerCase().includes('mqtt'));
      if (mqttAddon && mqttAddon.state === 'started') {
        findings.info.push({ id: 'mqtt_broker', title: 'MQTT broker is running', desc: `${(mqttAddon.name)}`, fix: 'Ensure MQTT has authentication enabled and is not exposed to the internet' });
      }

      const automationEntities = allEntities.filter(e => e.startsWith('automation.'));
      const scriptEntities = allEntities.filter(e => e.startsWith('script.'));
      findings.info.push({ id: 'automation_count', title: `${automationEntities.length} automations, ${scriptEntities.length} scripts`, desc: 'Review automations periodically for unintended actions' });

      const riskyAddons = installedAddons.filter(a => {
        const name = (a.name || a.slug || '').toLowerCase();
        return name.includes('ftp') || name.includes('samba') || name.includes('telnet');
      });
      if (riskyAddons.length > 0) {
        findings.warning.push({ id: 'risky_services', title: 'Potentially risky network services', desc: riskyAddons.map(a => `${(a.name)} (${a.state || 'stopped'})`).join(', '), fix: 'Ensure file sharing services are properly secured and only accessible on local network' });
      }

      // Port exposure verification
      const portExposingAddons = installedAddons.filter(a => a.ports && Object.keys(a.ports).some(p => {
        const config = a.ports[p];
        return config && config.host_port !== null && config.host_port !== undefined;
      }));
      if (portExposingAddons.length > 0) {
        findings.info.push({ id: 'port_exposure', title: `${portExposingAddons.length} addon(s) expose host ports`, desc: portExposingAddons.map(a => (a.name) + ': ' + Object.entries(a.ports || {}).filter(([, c]) => c?.host_port).map(([p, c]) => p + '\u2192' + c.host_port).join(', ')).join('; '), fix: 'Verify each exposed port is necessary. Use Ingress when available to avoid port exposure.' });
      }

      // The supported endpoint exposes metadata for the current account only.
      // Retain only a count by explicit token type; never persist token metadata.
      try {
        const metadata = await callWS({ type: 'auth/refresh_tokens' });
        const types = new Set(['normal', 'system', 'long_lived_access_token']);
        if (!Array.isArray(metadata) || !metadata.every(t => t && types.has(t.type))) throw new TypeError('Unexpected token metadata');
        const count = metadata.filter(t => t.type === 'long_lived_access_token').length;
        findings[count > 5 ? 'warning' : 'info'].push({
          id: count > 5 ? 'many_tokens' : 'access_tokens',
          title: `${count} long-lived access token(s) for the current account`,
          desc: 'Only the current account token types were counted. Other users were not checked; ordinary login sessions are excluded.',
          fix: 'Review unused tokens in your Profile. Token values were not read or stored.'
        });
      } catch(e) {
        findings.info.push({ id: 'access_tokens_unavailable', title: 'Long-lived access tokens not checked', desc: 'Current-account token metadata is unavailable or unsupported. Other users were not checked. Review tokens manually in your Profile.' });
      }

      // Camera exposure check
      const cameraEntities = allEntities.filter(e => e.startsWith('camera.'));
      if (cameraEntities.length > 0 && externalUrl) {
        findings.info.push({ id: 'camera_exposure', title: `${cameraEntities.length} camera(s) detected with external access`, desc: 'Camera streams may be accessible via external URL', fix: 'Ensure camera streams are not publicly accessible. Use Frigate Privacy or VPN for remote access.' });
      }

      // Webhook check
      const webhookEntities = allEntities.filter(e => e.includes('webhook'));
      if (webhookEntities.length > 0) {
        findings.info.push({ id: 'webhooks', title: `${webhookEntities.length} webhook-related entit(ies)`, desc: 'Webhooks provide URL-based access to HA actions', fix: 'Ensure webhook URLs are kept secret and rotated periodically' });
      }

      // NEW CHECK: HACS custom repositories
      try {
        const hacsSensor = states['sensor.hacs'];
        if (hacsSensor) {
          const customRepos = hacsSensor.attributes?.custom_repositories || [];
          if (customRepos.length > 0) {
            findings.info.push({ id: 'hacs_custom_repos', title: `${customRepos.length} custom HACS repository(ies) installed`, desc: customRepos.slice(0, 3).map(r => r.repository || r).join(', ') + (customRepos.length > 3 ? '...' : ''), fix: 'Review custom repositories for trust and source quality' });
          }
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // Server-verified checks (Config Auditor integration). These replace the
      // earlier browser-side guesses about auth providers, IP bans and HTTP
      // settings, which the frontend cannot actually read.
      const server = await this._serverAudit(callWS);
      if (server && Array.isArray(server.findings)) {
        const bucketFor = { fail: 'critical', warning: 'warning', info: 'info', pass: 'pass', skipped: 'info' };
        for (const sf of server.findings) {
          const bucket = findings[bucketFor[sf.status] || 'info'];
          bucket.push({
            id: 'server_' + sf.id,
            title: sf.status === 'skipped' ? `${sf.title} (not checked)` : sf.title,
            skipped: sf.status === 'skipped',
            desc: sf.detail,
            fix: sf.fix || '',
            verified: ['fail', 'warning', 'info', 'pass'].includes(sf.status),
            resultState: sf.status === 'skipped' || !['fail', 'warning', 'info', 'pass'].includes(sf.status) ? 'not_checked' : undefined,
          });
        }
        serverVersion = server.version || '';
        reportSource = this._normalizeReportSource(server.report_source);
      } else {
        findings.info.push({
          id: 'server_checks_unavailable',
          title: 'Server-side checks are not available',
          desc: 'Login providers, administrator two-factor authentication, IP banning, trusted proxies and plain-text secrets in YAML can only be verified by the Config Auditor integration. They are not reported as passed.',
          fix: 'Install the Config Auditor integration (see the README), then add it in Settings \u2192 Devices & services (administrator account required).',
        });
      }

      // NEW CHECK: Privileged addons
      try {
        const privilegedAddons = installedAddons.filter(a => a.privileged === true);
        if (privilegedAddons.length > 0) {
          findings.warning.push({ id: 'privileged_addons', title: `${privilegedAddons.length} addon(s) with privileged access`, desc: privilegedAddons.map(a => (a.name)).join(', '), fix: 'Privileged addons have root-level access. Verify they are trustworthy and necessary.' });
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: Exposed addon ports
      try {
        const exposedAddons = installedAddons.filter(a => {
          const hasPorts = a.ports && Object.keys(a.ports).length > 0;
          const hasNetwork = a.network && Object.keys(a.network).length > 0;
          return hasPorts || hasNetwork;
        });
        if (exposedAddons.length > 0) {
          const portList = exposedAddons.map(a => {
            const ports = a.ports ? Object.keys(a.ports).join(',') : '';
            return `${(a.name)}${ports ? `:${ports}` : ''}`;
          }).join('; ');
          findings.info.push({ id: 'exposed_addon_ports', title: `${exposedAddons.length} addon(s) expose port(s)`, desc: portList, fix: 'Ensure exposed ports are not accessible from the internet. Use firewall rules if needed.' });
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: Ingress vs exposed addons
      try {
        const nonIngressAddons = installedAddons.filter(a => a.ingress !== true && a.ports && Object.keys(a.ports).length > 0);
        if (nonIngressAddons.length > 0) {
          findings.info.push({ id: 'non_ingress_addons', title: `${nonIngressAddons.length} addon(s) not using Ingress`, desc: nonIngressAddons.map(a => (a.name)).join(', '), fix: 'Consider using Ingress for safer addon access (only through HA UI)' });
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: Webhooks
      try {
        const webhookEntities = allEntities.filter(e => e.startsWith('automation.') || e.startsWith('script.'));
        let webhookCount = 0;
        webhookEntities.forEach(e => {
          const state = states[e];
          if (state?.attributes?.description?.includes('webhook') || state?.attributes?.trigger?.includes('webhook')) {
            webhookCount++;
          }
        });
        if (webhookCount > 0) {
          findings.info.push({ id: 'webhooks', title: `${webhookCount} automation(s)/script(s) with webhook(s)`, desc: 'Webhooks expose endpoints that can be triggered from the internet', fix: 'Ensure webhook URLs are not shared publicly. Use strong secrets in webhook URLs.' });
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: Camera entities
      try {
        const cameraEntities = allEntities.filter(e => e.startsWith('camera.'));
        if (cameraEntities.length > 0) {
          findings.info.push({ id: 'camera_count', title: `${cameraEntities.length} camera(s) configured`, desc: 'Camera streams should not be exposed directly to the internet', fix: 'Use Secure (SSL/TLS) connection. Do not expose camera ports directly. Use Nabu Casa or tunnel.' });
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: Media source / proxy exposure
      try {
        const mediaEntities = allEntities.filter(e => e.startsWith('media_player.'));
        if (mediaEntities.length > 0) {
          findings.info.push({ id: 'media_exposure', title: `${mediaEntities.length} media player(s) configured`, desc: 'Ensure media sources are not serving public content', fix: 'Use local media libraries. Do not expose media over the internet unless necessary.' });
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: Recorder / history purge settings
      try {
        const recorderEntities = allEntities.filter(e => e.startsWith('recorder.'));
        if (recorderEntities.length > 0) {
          const recorderState = states['automation.'] || states['script.'];
          const purgeKeepDays = auditHass.config?.components?.recorder?.purge_keep_days;
          if (purgeKeepDays && purgeKeepDays > 30) {
            findings.info.push({ id: 'recorder_retention', title: `Recorder keeping data for ${purgeKeepDays} days`, desc: 'Long retention can be a privacy concern if you have guests or visitors', fix: 'Consider reducing purge_keep_days in configuration.yaml if privacy is a concern' });
          }
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: Supervisor debug mode
      try {
        if (supervisorInfo?.debug === true) {
          findings.warning.push({ id: 'supervisor_debug', title: 'Supervisor debug mode is enabled', desc: 'Debug mode exposes additional logs and should not stay enabled outside troubleshooting', fix: 'Disable debug mode in Supervisor settings unless troubleshooting' });
        }
        if (supervisorInfo?.debug_block === true) {
          findings.info.push({ id: 'supervisor_debug_block', title: 'Supervisor debug block is enabled', desc: 'This is a development/testing feature', fix: 'Ensure this is intentional and not left enabled in production' });
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: HACS addon integrity
      try {
        const hacsAddon = installedAddons.find(a => a.slug === 'hacs');
        if (hacsAddon) {
          if (hacsAddon.update_available) {
            findings.warning.push({ id: 'hacs_update', title: 'HACS addon has an update available', desc: `Current: ${hacsAddon.version} \u2192 Latest: ${hacsAddon.version_latest}`, fix: 'Update HACS addon from Settings \u2192 Add-ons' });
          } else {
            findings.pass.push({ id: 'hacs_update', title: 'HACS addon is up to date', desc: `Version: ${hacsAddon.version}` });
          }
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: Bluetooth / USB exposure in addons
      try {
        const btUsbAddons = installedAddons.filter(a => {
          const config = a.devices || [];
          return config.some(d => d && (d.includes('bluetooth') || d.includes('usb') || d.includes('/dev/bus/usb')));
        });
        if (btUsbAddons.length > 0) {
          findings.info.push({ id: 'bt_usb_addons', title: `${btUsbAddons.length} addon(s) with Bluetooth/USB access`, desc: btUsbAddons.map(a => (a.name)).join(', '), fix: 'Verify that these addons are trustworthy. USB/Bluetooth access provides direct hardware access.' });
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: Firewall / Network isolation
      try {
        if (hostInfo?.chassis && hostInfo.chassis !== 'embedded') {
          findings.info.push({ id: 'host_chassis', title: 'Host hardware type', desc: `Supervisor reports chassis: ${hostInfo.chassis}. This does not establish installation type or network isolation.` });
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: Backup encryption
      try {
        const backups = await callWS({ type: 'supervisor/api', endpoint: '/backups', method: 'get' });
        const backupList = backups?.backups || backups?.data?.backups || [];
        if (backupList.length > 0) {
          const unencryptedBackups = backupList.filter(b => b.protected === false);
          if (unencryptedBackups.length > 0) {
            findings.warning.push({ id: 'unencrypted_backups', title: `${unencryptedBackups.length} backup(s) without encryption`, desc: 'Unencrypted backups expose sensitive data', fix: 'Create new backups with a password. Set a backup password in Settings \u2192 System \u2192 Backups' });
          }
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: MQTT anonymous access
      try {
        const mqttAddonRunning = installedAddons.find(a => (a.slug || '').includes('mosquitto') && a.state === 'started');
        if (mqttAddonRunning) {
          try {
            const mqttConfig = await callWS({ type: 'supervisor/api', endpoint: `/addons/${mqttAddonRunning.slug}/options`, method: 'get' });
            const opts = mqttConfig?.options || mqttConfig?.data?.options || {};
            if (opts.anonymous === true) {
              findings.critical.push({ id: 'mqtt_anonymous', title: 'MQTT allows anonymous connections', desc: 'Anyone on the network can connect to your MQTT broker without authentication', fix: 'Disable anonymous access in Mosquitto addon configuration and set up proper user credentials' });
            } else if (opts.anonymous === false) {
              findings.pass.push({ id: 'mqtt_anonymous', title: 'MQTT requires authentication', desc: 'Anonymous connections are disabled' });
            } else {
              findings.info.push({ id: 'mqtt_anonymous', title: 'MQTT anonymous access not checked', desc: 'The add-on response did not include an explicit anonymous setting.' });
            }
          } catch(e2) {
            findings.info.push({ id: 'mqtt_config', title: 'Could not verify MQTT configuration', desc: 'Unable to read Mosquitto addon settings', fix: 'Manually verify MQTT authentication settings' });
          }
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: Dangerous template sensors
      try {
        const templateEntities = allEntities.filter(e => e.includes('template') || e.includes('command_line'));
        if (templateEntities.length > 10) {
          findings.info.push({ id: 'template_sensors', title: `${templateEntities.length} template/command_line entities`, desc: 'Large number of template entities may indicate complex configs that need review', fix: 'Periodically review template sensors for unintended access or command execution paths' });
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: HTTP configuration (CORS)
      try {
        const httpConfig = auditHass.config;
        if (httpConfig?.components?.includes('cors') || httpConfig?.allowlist_external_urls?.length > 0) {
          findings.info.push({ id: 'cors_config', title: 'CORS or external URL allowlist configured', desc: 'Cross-origin requests or external URLs are permitted', fix: 'Review allowed origins and URLs to ensure they are trusted' });
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: Port 8123 direct exposure
      try {
        const externalUrl = auditHass.config?.external_url || '';
        if (externalUrl && externalUrl.includes(':8123')) {
          findings.info.push({ id: 'port_exposure', title: 'External URL includes port 8123', desc: `Configured external URL: ${externalUrl}. Internet reachability was not tested.`, fix: 'Review firewall and reverse proxy configuration if remote access is intended.' });
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      // NEW CHECK: Person tracking entities
      try {
        const personEntities = allEntities.filter(e => e.startsWith('person.'));
        if (personEntities.length > 0) {
          findings.info.push({ id: 'person_tracking', title: `${personEntities.length} person(s) tracked`, desc: 'Location data is sensitive PII', fix: 'Ensure only trusted users have access to person entities. Review recorder include/exclude.' });
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      const critCount = findings.critical.length;
      const warnCount = findings.warning.length;
      const passCount = findings.pass.length;
      const infoCount = findings.info.length;
      const totalChecks = critCount + warnCount + passCount + infoCount;

      // Fetch network interfaces from Supervisor API
      let networkInfo = [];
      try {
        const netResp = await callWS({ type: 'supervisor/api', endpoint: '/network/info', method: 'get' });
        networkInfo = netResp?.interfaces || netResp?.data?.interfaces || [];
      } catch(ne) { console.debug('[ha-config-auditor] caught:', ne); }
      if (networkInfo.length === 0) {
        try {
          const netWS = await callWS({ type: 'network' });
          if (netWS?.adapters) {
            networkInfo = netWS.adapters.filter(a => a && typeof a.name === 'string').map(a => ({
              interface: a.name, type: 'unknown',
              enabled: a.enabled, mac: '',
              ipv4: { address: a.ipv4 ? a.ipv4.map(ip => ip.address + '/' + ip.network_prefix) : [], method: 'N/A', gateway: null, nameservers: [] }
            }));
          }
        } catch(ne2) { console.debug('[ha-config-auditor] caught:', ne2); }
      }
      try {
        const infoResp = await callWS({ type: 'supervisor/api', endpoint: '/info', method: 'get' });
        hostInfo = infoResp || null;
      } catch(ne3) { console.debug('[ha-config-auditor] caught:', ne3); }

      // Fetch config entries (integrations)
      let cfgEntries = [];
      let integrationsAvailable = false;
      try {
        const entries = await callWS({type: 'config_entries/get'});
        if (Array.isArray(entries) && entries.every(e => e && typeof e.domain === 'string')) {
          cfgEntries = entries;
          integrationsAvailable = true;
        }
      } catch(e) { console.debug('[config-auditor]', e.message); }

      if (!isCurrent()) return;
      this._auditData = { serverVersion, reportSource, findings, critCount, warnCount, passCount, infoCount, totalChecks, users, usersAvailable, addons: installedAddons, addonsAvailable, integrations: cfgEntries, integrationsAvailable, entities: allEntities.length, networkInterfaces: networkInfo, hostInfo: hostInfo };
      this._lastScan = new Date();
      this._setReportIdentity();
    this._saveScanData();

    } catch(e) {
      if (!isCurrent()) return;
      console.error('[Config Auditor] Error:', e);
      this._auditData = { error: e.message };
    }

    if (!isCurrent()) return;
    this._loading = false;
    this._updateContent();
  }

  async _serverAudit(callWS) {
    // Provided by the Config Auditor integration (admin-only WebSocket command).
    try {
      return await callWS({ type: 'ha_config_auditor/audit' });
    } catch (e) {
      console.debug('[config-auditor] server checks unavailable:', e && (e.code || e.message));
      return null;
    }
  }

  _render() {
    const tabFocus = _rememberTabFocus(this);
    const inventoryFocus = _rememberConfigInventory(this);
    if (this._hass?.user?.is_admin !== true) {
      _disconnectConfigInventory(this); this._inventoryMounts = []; this._inventoryWidth = null;
      this._tabResizeObserver?.disconnect(); this._tabResizeObserver = null; this.removeAttribute('data-responsive-tabs-observed');
      const html = `<style>${HA_CONFIG_AUDITOR_BENTO_CSS}</style><div class="card" role="status">${_esc(this._t.adminRequired)}</div>`;
      this._lastHtml = html;
      this._exportDialog?.cancel();
      this.shadowRoot.innerHTML = html;
      return;
    }
    const html = `
      <style>${HA_CONFIG_AUDITOR_BENTO_CSS}${createUiV3({ language: this._lang }).css}
/* === HA Tools split — premium banners (donate / intro / prereq) === */

/* Donation footer — diamond top */
.donate-section {  margin: 24px 0 4px; padding: 20px 24px; position: relative; overflow: hidden;  background: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(236,72,153,0.06));  border: 1px solid rgba(99,102,241,0.18); border-radius: var(--bento-radius-md, 18px);  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px;  font-family: 'Inter', -apple-system, sans-serif;}
.donate-section:not([data-source="own-card"])::before {  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;  background: linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899);}
.donate-section .donate-text { flex: 1; min-width: 240px; }
.donate-section h3 {  margin: 0 0 6px; font-size: 16px; font-weight: 700; letter-spacing: -0.02em;  background: linear-gradient(135deg, #6366f1, #ec4899);  -webkit-background-clip: text; background-clip: text; color: transparent;}
.donate-section p { margin: 0; font-size: 13px; line-height: 1.55; color: var(--bento-text-secondary, #57534e); letter-spacing: -0.005em; }
.donate-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
.donate-btn {  display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px;  border-radius: 12px; font-weight: 700; font-size: 13px; letter-spacing: -0.005em;  text-decoration: none; transition: transform 0.2s cubic-bezier(0.4,0,0.2,1), box-shadow 0.2s, filter 0.2s;  border: 1px solid transparent;}
.donate-btn:hover { transform: translateY(-2px); filter: brightness(1.05); }
.donate-btn.coffee {  background: linear-gradient(135deg, #FFDD00, #FFC700); color: #000;  box-shadow: 0 4px 14px -2px rgba(255, 221, 0, 0.4);}
.donate-btn.coffee:hover { box-shadow: 0 8px 24px -4px rgba(255, 221, 0, 0.55); }
.donate-btn.paypal {  background: linear-gradient(135deg, #0070ba, #005ea6); color: #fff;  box-shadow: 0 4px 14px -2px rgba(0, 112, 186, 0.45);}
.donate-btn.paypal:hover { box-shadow: 0 8px 24px -4px rgba(0, 112, 186, 0.6); }
:host(.bento-dark) .donate-section { background: linear-gradient(135deg, rgba(129,140,248,0.10), rgba(244,114,182,0.10)); border-color: rgba(129,140,248,0.25); }
:host(.bento-dark) .donate-section h3 { background: linear-gradient(135deg, #a5b4fc, #f9a8d4); -webkit-background-clip: text; background-clip: text; color: transparent; }
:host(.bento-dark) .donate-section p { color: #d6d3d1; }
@media (max-width: 600px) {  .donate-section { flex-direction: column; text-align: center; padding: 18px; }  .donate-buttons { justify-content: center; width: 100%; } }

/* Prereq banner — premium */
.prereq-banner {  display: flex; align-items: flex-start; gap: 14px; padding: 16px 20px;  border-radius: var(--bento-radius-sm, 12px); margin: 0 0 16px;  font-size: 13px; line-height: 1.55; border: 1px solid;  font-family: 'Inter', sans-serif; letter-spacing: -0.005em;  position: relative; overflow: hidden;}
.prereq-banner::before {  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;}
.prereq-banner.prereq-error { background: rgba(239,68,68,0.06); border-color: rgba(239,68,68,0.25); color: #991b1b; }
.prereq-banner.prereq-error::before { background: linear-gradient(180deg, #ef4444, #f87171); }
.prereq-banner.prereq-info  { background: rgba(99,102,241,0.06); border-color: rgba(99,102,241,0.25); color: #4338ca; }
.prereq-banner.prereq-info::before  { background: linear-gradient(180deg, #6366f1, #8b5cf6); }
.prereq-banner .prereq-icon { font-size: 22px; line-height: 1; padding-top: 2px; flex-shrink: 0; }
.prereq-banner .prereq-text { flex: 1; min-width: 0; }
.prereq-banner .prereq-text strong { font-weight: 700; letter-spacing: -0.01em; }
.prereq-banner code {  background: rgba(0,0,0,0.06); padding: 1px 7px; border-radius: 5px;  font-size: 12px; font-family: 'JetBrains Mono', ui-monospace, monospace;  border: 1px solid rgba(0,0,0,0.08);}
.prereq-banner .prereq-cta {  display: inline-flex; align-items: center; padding: 8px 16px; border-radius: 10px;  background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff !important;  text-decoration: none; font-weight: 700; font-size: 12.5px; flex-shrink: 0;  letter-spacing: -0.005em;  box-shadow: 0 4px 14px -2px rgba(99,102,241,0.45);  transition: all 0.2s cubic-bezier(0.4,0,0.2,1);}
.prereq-banner .prereq-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 24px -4px rgba(99,102,241,0.6); }
:host(.bento-dark) .prereq-banner.prereq-error { background: rgba(248,113,113,0.10); border-color: rgba(248,113,113,0.30); color: #fca5a5; }
:host(.bento-dark) .prereq-banner.prereq-info { background: rgba(129,140,248,0.10); border-color: rgba(129,140,248,0.30); color: #c7d2fe; }
:host(.bento-dark) .prereq-banner code { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.10); }
@media (max-width: 600px) {  .prereq-banner { flex-direction: column; align-items: stretch; padding-left: 20px; }  .prereq-banner .prereq-cta { align-self: flex-start; } }

/* First-run intro banner — premium */
.intro-banner {  position: relative; padding: 18px 52px 18px 22px; margin: 0 0 18px;  background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(236,72,153,0.06));  border: 1px solid rgba(99,102,241,0.20);  border-radius: var(--bento-radius-sm, 12px);  font-size: 13px; line-height: 1.55; overflow: hidden;  font-family: 'Inter', sans-serif; letter-spacing: -0.005em;  animation: bentoSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);}
.intro-banner::before {  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;  background: linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899);}
.intro-banner .intro-headline {  font-weight: 700; font-size: 14.5px; margin-bottom: 10px; letter-spacing: -0.02em;  background: linear-gradient(135deg, #6366f1, #ec4899);  -webkit-background-clip: text; background-clip: text; color: transparent;  display: flex; align-items: center; gap: 8px;}
.intro-banner .intro-steps {  margin: 8px 0 0; padding: 0; list-style: none; counter-reset: introstep;}
.intro-banner .intro-steps li {  margin-bottom: 8px; line-height: 1.55; color: var(--bento-text, #0c0a09);  padding-left: 32px; position: relative; counter-increment: introstep;  font-size: 12.5px;}
.intro-banner .intro-steps li::before {  content: counter(introstep); position: absolute; left: 0; top: -1px;  width: 22px; height: 22px; border-radius: 50%;  background: var(--bento-card, #fff); border: 1px solid rgba(99,102,241,0.25);  display: flex; align-items: center; justify-content: center;  font-size: 11px; font-weight: 800; color: #6366f1;  font-family: 'JetBrains Mono', ui-monospace, monospace;  font-feature-settings: 'tnum' 1;}
.intro-banner .intro-dismiss {  position: absolute; top: 12px; right: 14px;  background: var(--bento-card, transparent); border: 1px solid var(--bento-border, transparent);  cursor: pointer; font-size: 14px; line-height: 1;  color: var(--bento-text-secondary, #64748B);  padding: 4px 8px; border-radius: 999px;  transition: all 0.15s ease;}
.intro-banner .intro-dismiss:hover {  background: var(--bento-bg-2, #e7e5e4); color: var(--bento-text, #0c0a09);  transform: rotate(90deg);}
:host(.bento-dark) .intro-banner { background: linear-gradient(135deg, rgba(129,140,248,0.14), rgba(244,114,182,0.10)); border-color: rgba(129,140,248,0.30); }
:host(.bento-dark) .intro-banner .intro-headline { background: linear-gradient(135deg, #a5b4fc, #f9a8d4); -webkit-background-clip: text; background-clip: text; color: transparent; }
:host(.bento-dark) .intro-banner .intro-steps li { color: #fafaf9; }
:host(.bento-dark) .intro-banner .intro-steps li::before { background: #16161f; border-color: rgba(129,140,248,0.35); color: #a5b4fc; }
:host(.bento-dark) .intro-banner .intro-dismiss { background: #16161f; border-color: #27272f; color: #d6d3d1; }
:host(.bento-dark) .intro-banner .intro-dismiss:hover { background: #27272f; color: #fafaf9; }


/* ===== BENTO LIGHT MODE DESIGN SYSTEM ===== */

:host {
  --bento-primary: #3B82F6;
  --bento-primary-hover: #2563EB;
  --bento-primary-light: rgba(59, 130, 246, 0.08);
  --bento-success: #10B981;
  --bento-success-light: rgba(16, 185, 129, 0.08);
  --bento-error: #EF4444;
  --bento-error-light: rgba(239, 68, 68, 0.08);
  --bento-warning: #F59E0B;
  --bento-warning-light: rgba(245, 158, 11, 0.08);
  --bento-bg: var(--primary-background-color, #F8FAFC);
  --bento-card: var(--card-background-color, #FFFFFF);
  --bento-border: var(--divider-color, #E2E8F0);
  --bento-text: var(--primary-text-color, #1E293B);
  --bento-text-secondary: var(--secondary-text-color, #64748B);
  --bento-text-muted: var(--disabled-text-color, #94A3B8);
  --bento-radius-xs: 6px;
  --bento-radius-sm: 10px;
  --bento-radius-md: 16px;
  --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.04);
  --bento-shadow-lg: 0 8px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04);
  --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
:host(.bento-dark) {
    --bento-bg: var(--primary-background-color, #1a1a2e);
    --bento-card: var(--card-background-color, #16213e);
    --bento-text: var(--primary-text-color, #e2e8f0);
    --bento-text-secondary: var(--secondary-text-color, #94a3b8);
    --bento-border: var(--divider-color, #334155);
    --bento-success: #34d399;
    --bento-warning: #fbbf24;
    --bento-error: #f87171;
  }
:host-context([data-themes]) {
  --bento-bg: var(--lovelace-background, var(--primary-background-color, #F8FAFC));
  --bento-card: var(--card-background-color, var(--ha-card-background, #FFFFFF));
  --bento-text: var(--primary-text-color, #1E293B);
  --bento-text-secondary: var(--secondary-text-color, #64748B);
  --bento-border: var(--divider-color, #E2E8F0);
}

/* Card */
.card, .ha-card, ha-card, .main-card, .exporter-card, .card, .reports-card, .storage-card, .chore-card, .cry-card, .backup-card, .network-card, .sentence-card, .energy-card, .panel-card {
  background: var(--bento-card) !important;
  border: 1px solid var(--bento-border) !important;
  border-radius: var(--bento-radius-md) !important;
  box-shadow: var(--bento-shadow-sm) !important;
  font-family: 'Inter', sans-serif !important;
  color: var(--bento-text) !important;
  overflow: visible;
  padding: 20px !important;
}

/* Headers */
.card-header, .header, .card-title, h1, h2, h3 {
  color: var(--bento-text) !important;
  font-family: 'Inter', sans-serif !important;
}
.card-header, .header {
  border-bottom: 1px solid var(--bento-border) !important;
  padding-bottom: 12px !important;
  margin-bottom: 16px !important;
}

/* Tabs */
.tabs, .tab-bar, .tab-nav, .tab-header {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid var(--bento-border);
  padding: 0 4px;
  margin-bottom: 20px;
  overflow-x: auto;
}
.tab, .tab-btn, .tab-btn {
  padding: 10px 18px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  color: var(--bento-text-secondary);
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: var(--bento-transition);
  white-space: nowrap;
  border-radius: 0;
}
.tab:hover, .tab-btn:hover, .tab-btn:hover {
  color: var(--bento-primary);
  background: var(--bento-primary-light);
}
.tab.active, .tab-btn.active, .tab-btn.active {
  color: var(--bento-primary);
  border-bottom-color: var(--bento-primary);
  background: rgba(59, 130, 246, 0.04);
  font-weight: 600;
}

/* Tab content */
.tab-content { display: none; }
.tab-content.active { display: block; animation: bentoFadeIn 0.3s ease-out; }
@keyframes bentoFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

/* Buttons */
button, .btn, .action-btn {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--bento-radius-xs);
  transition: var(--bento-transition);
  cursor: pointer;
}
button.active, .btn.active, .btn-primary, .action-btn.active {
  background: var(--bento-primary) !important;
  color: white !important;
  border-color: var(--bento-primary) !important;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
}

/* Status badges */
.badge, .status-badge, .tag, .chip {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.badge-success, .status-ok, .status-good { background: var(--bento-success-light); color: var(--bento-success); }
.badge-error, .status-error, .status-critical { background: var(--bento-error-light); color: var(--bento-error); }
.badge-warning, .status-warning { background: var(--bento-warning-light); color: var(--bento-warning); }
.badge-info, .status-info { background: var(--bento-primary-light); color: var(--bento-primary); }

/* Tables */
table { width: 100%; border-collapse: separate; border-spacing: 0; font-family: 'Inter', sans-serif; }
th { background: var(--bento-bg); color: var(--bento-text-secondary); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 14px; text-align: left; border-bottom: 2px solid var(--bento-border); }
td { padding: 12px 14px; border-bottom: 1px solid var(--bento-border); color: var(--bento-text); font-size: 13px; }
tr:hover td { background: var(--bento-primary-light); }
tr:last-child td { border-bottom: none; }

/* Inputs & selects */
input, select, textarea {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  padding: 8px 12px;
  border: 1.5px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  background: var(--bento-card);
  color: var(--bento-text);
  transition: var(--bento-transition);
  outline: none;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--bento-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Stat cards */
.stat-card, .stat, .metric-card, .stat-box, .overview-stat, .kpi-card {
  background: var(--bento-card);
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-sm);
  padding: 16px;
  transition: var(--bento-transition);
}
.stat-card:hover, .stat:hover, .metric-card:hover { box-shadow: var(--bento-shadow-md); transform: translateY(-1px); }
.stat-value, .metric-value, .stat-number { font-size: 28px; font-weight: 700; color: var(--bento-text); font-family: 'Inter', sans-serif; }
.stat-label, .metric-label, .stat-title { font-size: 12px; font-weight: 500; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }

/* Canvas override (prevent Bento CSS from distorting charts) */
canvas {
  max-width: 100% !important;
  height: auto !important;
  width: auto !important;
  border: none !important;
}

/* Pagination */
.pagination, .pag {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  padding: 16px 0;
  border-top: 1px solid var(--bento-border);
}
.pagination-btn, .pag-btn {
  padding: 8px 14px;
  border: 1.5px solid var(--bento-border);
  background: var(--bento-card);
  color: var(--bento-text);
  border-radius: var(--bento-radius-xs);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  transition: var(--bento-transition);
}
.pagination-btn:hover:not(:disabled), .pag-btn:hover:not(:disabled) { background: var(--bento-primary); color: white; border-color: var(--bento-primary); }
.pagination-btn:disabled, .pag-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pagination-info, .pag-info { font-size: 13px; color: var(--bento-text-secondary); font-weight: 500; padding: 0 8px; }
.page-size-select { padding: 6px 10px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); font-size: 12px; font-family: 'Inter', sans-serif; }

/* Empty state */
.empty-state, .no-data, .no-results {
  text-align: center;
  padding: 48px 24px;
  color: var(--bento-text-secondary);
  font-size: 14px;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bento-text-muted); }

/* ===== END BENTO LIGHT MODE ===== */



:host {
  --bento-bg: var(--primary-background-color, #F8FAFC);
  --bento-card: var(--card-background-color, #FFFFFF);
  --bento-primary: #3B82F6;
  --bento-primary-hover: #2563EB;
  --bento-text: var(--primary-text-color, #1E293B);
  --bento-text-secondary: var(--secondary-text-color, #64748B);
  --bento-border: var(--divider-color, #E2E8F0);
  --bento-success: #10B981;
  --bento-warning: #F59E0B;
  --bento-error: #EF4444;
  --bento-radius-sm: 10px;
  --bento-radius-xs: 6px;
  --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.06);
  --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: block;
  color-scheme: light dark;
}
* { box-sizing: border-box; }

.card, .card-container, .reports-card, .export-card {
  background: var(--bento-card); border-radius: var(--bento-radius-sm); box-shadow: var(--bento-shadow-sm);
  padding: 28px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--bento-text); border: 1px solid var(--bento-border); animation: fadeSlideIn 0.4s ease-out;
}
.card-header { font-size: 20px; font-weight: 700; margin-bottom: 20px; color: var(--bento-text); letter-spacing: -0.01em; display: flex; justify-content: space-between; align-items: center; }
.card-header h2 { font-size: 20px; font-weight: 700; color: var(--bento-text); margin: 0; letter-spacing: -0.01em; }
.card-title, .title, .header-title, .pan-title { font-size: 20px; font-weight: 700; color: var(--bento-text); letter-spacing: -0.01em; }
.header, .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--bento-border); margin-bottom: 24px; overflow-x: auto; padding-bottom: 0; }
.tab, .tab-btn, .tab-btn { padding: 10px 20px; border: none; background: transparent; color: var(--bento-text-secondary); cursor: pointer; font-size: 14px; font-weight: 500; border-bottom: 2px solid transparent; transition: var(--bento-transition); white-space: nowrap; margin-bottom: -2px; border-radius: 8px 8px 0 0; font-family: 'Inter', sans-serif; }
.tab.active, .tab-btn.active, .tab-btn.active { color: var(--bento-primary); border-bottom-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.tab:hover, .tab-btn:hover, .tab-btn:hover { color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.tab-icon { margin-right: 6px; }
.tab-content { display: none; }
.tab-content.active { display: block; animation: fadeSlideIn 0.3s ease-out; }

button, .btn, .btn-s { padding: 9px 16px; border: 1.5px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
button:hover, .btn:hover, .btn-s:hover { background: var(--bento-bg); border-color: var(--bento-primary); color: var(--bento-primary); }
button.active, .btn.active, .btn-act { background: var(--bento-primary); color: white; border-color: var(--bento-primary); box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25); }
.btn-primary { padding: 9px 16px; background: var(--bento-primary); color: white; border: 1.5px solid var(--bento-primary); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif; transition: var(--bento-transition); box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25); }
.btn-primary:hover { background: var(--bento-primary-hover); border-color: var(--bento-primary-hover); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35); transform: translateY(-1px); }
.btn-secondary { padding: 9px 16px; background: var(--bento-card); color: var(--bento-text); border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.btn-secondary:hover { border-color: var(--bento-primary); color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.btn-danger { padding: 9px 16px; background: var(--bento-card); color: var(--bento-error); border: 1.5px solid var(--bento-error); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.btn-danger:hover { background: var(--bento-error); color: white; }
.btn-small { padding: 5px 12px; font-size: 12px; border: 1px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text-secondary); border-radius: var(--bento-radius-xs); cursor: pointer; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.btn-small:hover { border-color: var(--bento-primary); color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }

input[type="text"], input[type="number"], input[type="date"], input[type="time"], input[type="email"], input[type="search"], select, textarea, .search-input, .sinput, .sinput-sm, .alert-search-box, .period-select { padding: 9px 14px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm); font-size: 13px; background: var(--bento-card); color: var(--bento-text); font-family: 'Inter', sans-serif; transition: var(--bento-transition); outline: none; }
input[type="text"]:focus, input[type="number"]:focus, input[type="date"]:focus, input[type="time"]:focus, select:focus, textarea:focus, .search-input:focus, .sinput:focus, .sinput-sm:focus, .alert-search-box:focus, .period-select:focus { border-color: var(--bento-primary); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
input::placeholder, .search-input::placeholder, .sinput::placeholder, .sinput-sm::placeholder { color: var(--bento-text-secondary); opacity: 0.7; }
.form-group { margin-bottom: 16px; }
.form-group.full { grid-column: 1 / -1; }
.form-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
label, .cg label, .clbl { display: block; font-size: 12px; font-weight: 600; color: var(--bento-text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.03em; }
.add-form { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 20px; margin-bottom: 20px; }
textarea { min-height: 80px; resize: vertical; }

.stats, .stats-grid, .stats-container, .summary-grid, .network-stats, .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat, .stat-card, .summary-card, .network-stat, .metric-card, .kpi-card { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); transition: var(--bento-transition); text-align: center; }
.stat:hover, .stat-card:hover, .summary-card:hover, .network-stat:hover, .metric-card:hover { border-color: var(--bento-primary); box-shadow: var(--bento-shadow-md); transform: translateY(-1px); }
.stat-card.online { border-left: 3px solid var(--bento-success); }
.stat-card.offline { border-left: 3px solid var(--bento-error); }
.sv, .stat-value, .summary-value, .network-stat-value, .metric-value { font-size: 24px; font-weight: 700; color: var(--bento-primary); line-height: 1.2; }
.stat.ok .sv { color: var(--bento-success); }
.stat.err .sv { color: var(--bento-error); }
.sl, .stat-label, .summary-label, .network-stat-label, .metric-label { font-size: 12px; color: var(--bento-text-secondary); font-weight: 500; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.03em; }
.stat-trend { font-size: 12px; font-weight: 600; margin-top: 4px; }
.stat-trend.positive, .trend-up { color: var(--bento-success); }
.stat-trend.negative, .trend-down { color: var(--bento-error); }

.table-container { width: 100%; max-width: 100%; overflow-x: auto; }
.device-table, .entity-table, .table, .alert-table, .data-table, .backup-table, .history-table, .log-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 16px; }
.device-table th, .entity-table th, .table th, .alert-table th, .data-table th, .backup-table th, table th { text-align: left; padding: 12px 16px; border-bottom: 2px solid var(--bento-border); font-weight: 600; color: var(--bento-text-secondary); background: var(--bento-bg); cursor: pointer; user-select: none; white-space: nowrap; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.device-table th:first-child, .entity-table th:first-child, .table th:first-child, table th:first-child { border-radius: var(--bento-radius-xs) 0 0 0; }
.device-table th:last-child, .entity-table th:last-child, .table th:last-child, table th:last-child { border-radius: 0 var(--bento-radius-xs) 0 0; }
.device-table th:hover, .entity-table th:hover, .table th:hover, table th:hover { background: rgba(59, 130, 246, 0.06); color: var(--bento-primary); }
.device-table th.sorted, .entity-table th.sorted, .table th.sorted, table th.sorted { background: rgba(59, 130, 246, 0.08); color: var(--bento-primary); }
.device-table td, .entity-table td, .table td, .alert-table td, .data-table td, .backup-table td, table td { padding: 12px 16px; border-bottom: 1px solid var(--bento-border); color: var(--bento-text); font-size: 13px; font-family: 'Inter', sans-serif; }
.device-table tr:hover, .entity-table tr:hover, .table tbody tr:hover, .alert-table tr:hover, table tr:hover { background: rgba(59, 130, 246, 0.03); }
.table-container { overflow-x: auto; border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); }
.sort-indicator { font-size: 10px; margin-left: 4px; color: var(--bento-primary); }

.status-badge, .severity-badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; }
.status-online, .status-home, .status-active, .status-ok, .status-healthy, .status-running, .status-complete, .status-completed, .status-success, .badge-success { background: rgba(16, 185, 129, 0.1); color: #059669; }
.status-offline, .status-error, .status-failed, .status-critical, .severity-critical, .badge-error, .badge-danger { background: rgba(239, 68, 68, 0.1); color: #DC2626; }
.status-away, .status-warning, .severity-warning, .badge-warning { background: rgba(245, 158, 11, 0.1); color: #B45309; }
.status-unavailable, .status-unknown, .status-idle, .status-inactive, .status-stopped, .badge-neutral { background: rgba(100, 116, 139, 0.1); color: var(--bento-text-secondary); }
.status-zone, .severity-info, .badge-info { background: rgba(59, 130, 246, 0.1); color: var(--bento-primary); }

.alert-item { padding: 14px 18px; border-left: 4px solid var(--bento-border); border-radius: 0 var(--bento-radius-sm) var(--bento-radius-sm) 0; margin-bottom: 10px; background: var(--bento-bg); display: flex; justify-content: space-between; align-items: center; transition: var(--bento-transition); }
.alert-item:hover { box-shadow: var(--bento-shadow-sm); }
.alert-critical { border-color: var(--bento-error); background: rgba(239, 68, 68, 0.04); }
.alert-warning { border-color: var(--bento-warning); background: rgba(245, 158, 11, 0.04); }
.alert-info { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.alert-text { flex: 1; }
.alert-type { font-weight: 600; font-size: 13px; margin-bottom: 4px; color: var(--bento-text); }
.alert-time { font-size: 12px; color: var(--bento-text-secondary); }
.alert-actions { display: flex; gap: 8px; }
.alert-dismiss { padding: 6px 12px; font-size: 12px; background: var(--bento-card); color: var(--bento-text-secondary); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-xs); cursor: pointer; font-weight: 500; transition: var(--bento-transition); }
.alert-dismiss:hover { background: var(--bento-error); color: white; border-color: var(--bento-error); }

.section { margin-bottom: 24px; }
.section h3, .section-title, .pan-head { font-size: 16px; font-weight: 600; color: var(--bento-text); margin-bottom: 12px; letter-spacing: -0.01em; }

.battery-grid, .grid, .items-grid, .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.battery-card, .item-card, .chore-card, .entry-card, .backup-card { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); transition: var(--bento-transition); }
.battery-card:hover, .item-card:hover, .chore-card:hover, .entry-card:hover, .backup-card:hover { box-shadow: var(--bento-shadow-md); border-color: var(--bento-primary); transform: translateY(-1px); }
.chore-card.priority-high { border-left: 3px solid var(--bento-error); }
.chore-card.priority-medium { border-left: 3px solid var(--bento-warning); }
.chore-card.priority-low { border-left: 3px solid var(--bento-success); }
.chore-title, .entry-title, .item-title { font-weight: 600; font-size: 14px; color: var(--bento-text); margin-bottom: 6px; }
.chore-meta, .entry-meta, .item-meta { font-size: 12px; color: var(--bento-text-secondary); }
.chore-assignee { font-size: 12px; color: var(--bento-primary); font-weight: 500; }
.chore-actions, .item-actions, .entry-actions { display: flex; gap: 6px; margin-top: 10px; }

.battery-bar, .progress-bar, .bandwidth-bar-bg { width: 100%; height: 8px; background: var(--bento-border); border-radius: 4px; overflow: hidden; margin-top: 8px; }
.battery-fill, .progress-fill, .bandwidth-bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); background: var(--bento-success); }
.battery-fill.battery_critical { background: var(--bento-error) !important; }
.battery-fill.battery_warning { background: var(--bento-warning) !important; }
.battery-label, .bandwidth-label { font-size: 13px; color: var(--bento-text); font-weight: 500; display: flex; justify-content: space-between; align-items: center; }

.pagination, .pag { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 20px; padding: 16px 0; border-top: 1px solid var(--bento-border); }
.pagination-btn, .pag-btn { padding: 8px 14px; border: 1.5px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text); border-radius: var(--bento-radius-xs); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.pagination-btn:hover:not(:disabled), .pag-btn:hover:not(:disabled) { background: var(--bento-primary); color: white; border-color: var(--bento-primary); }
.pagination-btn:disabled, .pag-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pagination-info, .pag-info { font-size: 13px; color: var(--bento-text-secondary); font-weight: 500; padding: 0 8px; }
.page-size-selector, .pag-size { padding: 6px 10px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); background: var(--bento-card); color: var(--bento-text); font-size: 13px; cursor: pointer; font-family: 'Inter', sans-serif; }

.col-main { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--bento-text); }
.topbar-r { display: flex; gap: 8px; align-items: center; }
.panels { display: flex; gap: 12px; }
.pan-left, .pan-center, .pan-right { background: var(--bento-card); border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); overflow: hidden; }
.cbar { display: flex; gap: 8px; align-items: center; padding: 12px; background: var(--bento-bg); border-bottom: 1px solid var(--bento-border); }
.cg { display: flex; gap: 8px; align-items: center; }
.cg-r { margin-left: auto; }

.dd { position: relative; }
.dd-menu { position: absolute; top: 100%; left: 0; background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); box-shadow: var(--bento-shadow-md); min-width: 180px; z-index: 100; display: none; overflow: hidden; }
.dd.open .dd-menu { display: block; }
.dd-i { padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--bento-text); transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.dd-i:hover { background: rgba(59, 130, 246, 0.06); color: var(--bento-primary); }
.dd-div { border-top: 1px solid var(--bento-border); margin: 4px 0; }

.auto-item, .tr-item, .list-item, .automation-item { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--bento-border); display: flex; align-items: center; gap: 10px; transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.auto-item:hover, .tr-item:hover, .list-item:hover, .automation-item:hover { background: rgba(59, 130, 246, 0.04); }
.auto-item.sel, .tr-item.sel, .list-item.selected, .automation-item.selected { background: rgba(59, 130, 246, 0.08); border-left: 3px solid var(--bento-primary); }
.auto-item.error-item, .automation-item.error-item { border-left: 3px solid var(--bento-error); }
.auto-name { font-weight: 500; font-size: 13px; color: var(--bento-text); }
.auto-meta { font-size: 12px; color: var(--bento-text-secondary); }
.auto-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bento-text-secondary); }
.auto-dot.s-running { background: var(--bento-success); }
.auto-dot.s-stopped { background: var(--bento-text-secondary); }
.auto-dot.s-error { background: var(--bento-error); }
.auto-count { font-size: 11px; color: var(--bento-text-secondary); margin-left: auto; }

.tgroup { border: 1px solid var(--bento-border); border-radius: var(--bento-radius-xs); margin-bottom: 8px; overflow: hidden; }
.tgroup-h { padding: 10px 14px; background: var(--bento-bg); display: flex; align-items: center; gap: 8px; cursor: pointer; transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.tgroup-h:hover { background: rgba(59, 130, 246, 0.06); }
.tg-tog { transition: transform 0.2s; font-size: 12px; color: var(--bento-text-secondary); }
.tgroup.collapsed .tg-tog { transform: rotate(-90deg); }
.tgroup.collapsed .tgroup-items { display: none; }
.tg-name { font-weight: 600; font-size: 13px; color: var(--bento-text); }
.tg-cnt { font-size: 11px; color: var(--bento-text-secondary); margin-left: auto; background: var(--bento-border); padding: 2px 8px; border-radius: 10px; }

.device-detail, .detail-panel, .details { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); }
.detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--bento-border); font-size: 13px; }
.detail-row:last-child { border-bottom: none; }
.detail-label { color: var(--bento-text-secondary); font-weight: 500; }
.detail-value { color: var(--bento-text); font-weight: 600; }

.board { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; }
.column { min-width: 260px; background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 12px; border: 1px solid var(--bento-border); }
.column-header { font-weight: 600; font-size: 14px; color: var(--bento-text); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
.column-count { background: var(--bento-border); color: var(--bento-text-secondary); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }

.schedule, .calendar { margin-top: 16px; }
.week-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 16px; }
.week-header { padding: 8px; text-align: center; font-size: 12px; font-weight: 600; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: 0.03em; border-radius: var(--bento-radius-xs); }
.week-cell { padding: 8px; text-align: center; font-size: 12px; background: var(--bento-bg); border: 1px solid var(--bento-border); cursor: pointer; transition: var(--bento-transition); border-radius: var(--bento-radius-xs); }
.week-cell:hover { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.chore-item { padding: 8px 12px; border-bottom: 1px solid var(--bento-border); font-size: 13px; }

.leaderboard { background: var(--bento-bg); border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); overflow: hidden; }
.leaderboard-row { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--bento-border); gap: 12px; font-size: 13px; transition: var(--bento-transition); }
.leaderboard-row:last-child { border-bottom: none; }
.leaderboard-row:hover { background: rgba(59, 130, 246, 0.04); }
.rank { font-weight: 700; color: var(--bento-primary); font-size: 14px; min-width: 28px; }
.name { font-weight: 500; color: var(--bento-text); flex: 1; }
.streak { color: var(--bento-warning); font-weight: 600; }
.completion { color: var(--bento-success); font-weight: 600; }

.baby-selector { display: flex; gap: 8px; margin-bottom: 16px; }
.quick-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
.quick-btn, .action-btn { padding: 10px 16px; border: 1.5px solid var(--bento-border); background: var(--bento-card); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); display: flex; align-items: center; gap: 6px; color: var(--bento-text); }
.quick-btn:hover, .action-btn:hover { border-color: var(--bento-primary); color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.quick-btn.active, .action-btn.active { background: var(--bento-primary); color: white; border-color: var(--bento-primary); }
.timeline { position: relative; padding-left: 24px; }
.timeline-item { padding: 12px 0; border-bottom: 1px solid var(--bento-border); position: relative; }
.timeline-time { font-size: 12px; color: var(--bento-text-secondary); font-weight: 500; }
.timeline-content { font-size: 13px; color: var(--bento-text); margin-top: 4px; }

canvas, .canvas-container canvas { width: 100%; height: 200px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); margin-bottom: 16px; }
.canvas-container { position: relative; margin-bottom: 16px; }
.chart-container { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); margin-bottom: 16px; }

.empty, .empty-state { text-align: center; padding: 48px 24px; color: var(--bento-text-secondary); font-size: 14px; font-family: 'Inter', sans-serif; }
.empty-ico, .empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
.spinner { width: 32px; height: 32px; border: 3px solid var(--bento-border); border-top: 3px solid var(--bento-primary); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 24px auto; }

.search-box, .search-bar, .controls, .ctrls, .filter-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
.control-group { display: flex; gap: 8px; align-items: center; }

.domain-group-header { margin-top: 20px; padding: 10px 16px; background: var(--bento-bg); border-radius: var(--bento-radius-xs); font-weight: 600; font-size: 14px; color: var(--bento-text); border: 1px solid var(--bento-border); }
.domain-group-header:first-child { margin-top: 0; }
.domain-group-count { font-weight: 500; color: var(--bento-text-secondary); font-size: 12px; margin-left: 8px; }

.automation-list, .list, .item-list { border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); overflow: hidden; }
.automation-name, .entity-name { font-weight: 500; font-size: 13px; color: var(--bento-text); }
.automation-id, .entity-id { font-size: 11px; color: var(--bento-text-secondary); }
.error-badge, .count-badge { background: var(--bento-error); color: white; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; margin-left: 6px; }
.tab .error-badge { background: var(--bento-error); color: white; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; margin-left: 6px; }

.health-score, .score { font-size: 48px; font-weight: 700; color: var(--bento-primary); text-align: center; margin: 16px 0; }
.emoji { font-size: 20px; line-height: 1; }
.device-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.08); border-radius: var(--bento-radius-xs); font-size: 16px; }

.recommendation-card, .tip-card, .suggestion-card { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); margin-bottom: 12px; transition: var(--bento-transition); }
.recommendation-card:hover, .tip-card:hover, .suggestion-card:hover { border-color: var(--bento-primary); box-shadow: var(--bento-shadow-md); }

.export-options, .options-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; }
.export-option, .option-card { background: var(--bento-bg); border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; cursor: pointer; transition: var(--bento-transition); text-align: center; }
.export-option:hover, .option-card:hover { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.export-option.selected, .option-card.selected { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.08); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }

.storage-bar, .usage-bar { width: 100%; height: 24px; background: var(--bento-border); border-radius: var(--bento-radius-xs); overflow: hidden; margin-bottom: 12px; }
.storage-fill, .usage-fill { height: 100%; border-radius: var(--bento-radius-xs); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); background: var(--bento-primary); }

.check-item, .audit-item { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--bento-border); transition: var(--bento-transition); }
.check-item:hover, .audit-item:hover { background: rgba(59, 130, 246, 0.03); }
.check-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 16px; }
.check-icon.pass { background: rgba(16, 185, 129, 0.1); }
.check-icon.fail { background: rgba(239, 68, 68, 0.1); }
.check-icon.warn { background: rgba(245, 158, 11, 0.1); }
.check-text, .audit-text { flex: 1; }
.check-title { font-weight: 600; font-size: 13px; color: var(--bento-text); }
.check-desc { font-size: 12px; color: var(--bento-text-secondary); margin-top: 2px; }

.waveform { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; margin-bottom: 16px; }
.analysis-result, .result-card { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 20px; text-align: center; margin-bottom: 16px; }
.confidence-bar { height: 8px; background: var(--bento-border); border-radius: 4px; overflow: hidden; margin-top: 8px; }
.confidence-fill { height: 100%; border-radius: 4px; background: var(--bento-primary); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }

.sentence-item, .intent-item { padding: 12px 16px; border-bottom: 1px solid var(--bento-border); display: flex; justify-content: space-between; align-items: center; transition: var(--bento-transition); }
.sentence-item:hover, .intent-item:hover { background: rgba(59, 130, 246, 0.03); }
.sentence-text { font-size: 13px; color: var(--bento-text); font-family: 'Inter', sans-serif; }
.intent-badge { display: inline-flex; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: rgba(59, 130, 246, 0.1); color: var(--bento-primary); }

.backup-item, .backup-entry { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--bento-border); transition: var(--bento-transition); }
.backup-item:hover, .backup-entry:hover { background: rgba(59, 130, 246, 0.03); }
.backup-name { font-weight: 500; font-size: 14px; color: var(--bento-text); }
.backup-date, .backup-size { font-size: 12px; color: var(--bento-text-secondary); }

.report-section { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 20px; border: 1px solid var(--bento-border); margin-bottom: 16px; }
.insight-card { padding: 14px; border-left: 3px solid var(--bento-primary); background: rgba(59, 130, 246, 0.04); border-radius: 0 var(--bento-radius-xs) var(--bento-radius-xs) 0; margin-bottom: 10px; }

@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bento-text-secondary); }

@media (max-width: 768px) {
  .card, .card-container, .reports-card, .export-card { padding: 16px; }
  .stats, .stats-grid, .summary-grid { grid-template-columns: repeat(2, 1fr); }
  .panels { flex-direction: column; }
  .board { flex-direction: column; }
  .column { min-width: unset; }
  .audit-summary-section { gap: 16px; }
}

/* ===== CONFIG AUDITOR SPECIFIC ===== */
.audit-summary-section { margin-bottom: 20px; padding: 16px; background: var(--bento-bg); border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); }
.audit-summary-section h3 { margin: 0 0 6px 0; font-size: 15px; font-weight: 600; color: var(--bento-text); }
.audit-summary-section p { margin: 0 0 12px 0; font-size: 12px; color: var(--bento-text-secondary); line-height: 1.5; }
.summary-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; color: var(--bento-text-secondary); }
.summary-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.summary-count { font-weight: 700; color: var(--bento-text); min-width: 20px; }

.finding { padding: 14px 16px; border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); margin-bottom: 8px; background: var(--bento-card); transition: var(--bento-transition); }
.finding:hover { box-shadow: var(--bento-shadow-sm); }
.finding.critical { border-left: 3px solid #f44336; }
.finding.warning { border-left: 3px solid #ff9800; }
.finding.info { border-left: 3px solid #03a9f4; }
.finding.pass { border-left: 3px solid #4caf50; }
.finding-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.finding-icon { font-size: 16px; }
.finding-title { font-weight: 600; font-size: 13px; color: var(--bento-text); flex: 1; }
.finding-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
.badge-critical { background: rgba(244, 67, 54, 0.1); color: #f44336; }
.badge-warning { background: rgba(255, 152, 0, 0.1); color: #ff9800; }
.badge-info { background: rgba(3, 169, 244, 0.1); color: #03a9f4; }
.badge-pass { background: rgba(76, 175, 80, 0.1); color: #4caf50; }
.badge-verified { background: rgba(99, 102, 241, 0.12); color: var(--bento-primary, #6366f1); margin-left: 6px; text-transform: none; }
.finding-desc { font-size: 12px; color: var(--bento-text-secondary); line-height: 1.5; }
.finding-fix { font-size: 12px; color: var(--bento-primary); margin-top: 6px; font-weight: 500; }

.section-title { font-size: 14px; font-weight: 600; color: var(--bento-text); margin: 16px 0 8px 0; padding-bottom: 6px; border-bottom: 1px solid var(--bento-border); }
.section-title:first-child { margin-top: 0; }

.status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }

.scan-info { font-size: 12px; color: var(--bento-text-muted); text-align: right; margin-top: 12px; font-style: italic; }

.tip-box { padding: 14px 16px; background: var(--bento-bg); border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); font-size: 13px; color: var(--bento-text-secondary); line-height: 1.6; }
.tip-box strong { color: var(--bento-text); }

.empty-msg { text-align: center; padding: 32px; color: var(--bento-text-secondary); font-size: 14px; }

.table-container { overflow-x: auto; margin-bottom: 16px; }

.loading { text-align: center; padding: 48px; color: var(--bento-text-secondary); font-size: 14px; }


        /* === MOBILE FIX === */
        @media (max-width: 768px) {
          .tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; gap: 2px; }
          .tab, .tab-btn, .tab-btn { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
          .card, .card-container { padding: 14px; }
          .stats, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .stat-val, .kpi-val, .metric-val { font-size: 18px; }
          .stat-lbl, .kpi-lbl, .metric-lbl { font-size: 10px; }
          .panels, .board { flex-direction: column; }
          .column { min-width: unset; }
          h2 { font-size: 18px; }
          h3 { font-size: 15px; }
        }
        @media (max-width: 480px) {
          .tabs { gap: 1px; }
          .tab, .tab-btn, .tab-btn { padding: 5px 8px; font-size: 11px; }
          .stats, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid { grid-template-columns: 1fr 1fr; }
          .stat-val, .kpi-val, .metric-val { font-size: 16px; }
          .summary-row { justify-content: center; }
        }
      


.report-tools { container-type:inline-size;min-width:0;margin:16px 0;padding:12px;border:1px solid var(--bento-border);border-radius:12px; }
.report-tools p,.report-tools h3,.report-tools td { overflow-wrap:anywhere; }
.report-tools .report-actions,.report-tools .report-choices { display:flex;flex-wrap:wrap;gap:8px; }
.report-tools button,.report-tools select { min-height:44px;min-width:44px;font:inherit;max-width:100%;white-space:normal; }
.report-tools button { padding:8px 12px; }
.report-tools label { display:flex;flex:1 1 220px;min-width:0;flex-direction:column;gap:4px; }
.report-tools table { width:100%;border-collapse:collapse;table-layout:fixed; }
.report-tools th,.report-tools td { padding:8px;text-align:start;vertical-align:top; }
.report-tools :focus-visible { outline:3px solid var(--primary-color,#1769aa);outline-offset:2px; }
@container (max-width:499px) { .report-tools table,.report-tools tbody,.report-tools tr,.report-tools td { display:block;width:100%; } .report-tools thead { display:none; } .report-tools tr { margin:8px 0;border:1px solid var(--bento-border);border-radius:8px; } .report-tools td::before { content:attr(data-label) ': ';font-weight:600; } }
${_RESPONSIVE_CONTROL_CSS}${_CONFIG_INVENTORY_CSS}
</style>
        ${_renderLocalIntro(this._lang)}
        <div class="card">
          <div class="card-header">
            <h2>${_esc(this._config.title || '')}</h2>
            <button type="button" class="audit-refresh">${_esc(this._t.refresh)}</button>
          </div>
          <div class="tabs" role="tablist">
            <button class="tab-button ${this._activeTab === 'overview' ? 'active' : ''}" data-tab="overview" role="tab" aria-selected="${this._activeTab === 'overview'}">${_esc(this._msg('Overview'))}</button>
            <button class="tab-button ${this._activeTab === 'critical' ? 'active' : ''}" data-tab="critical" role="tab" aria-selected="${this._activeTab === 'critical'}">${_esc(this._msg('Findings'))}</button>
            <button class="tab-button ${this._activeTab === 'addons' ? 'active' : ''}" data-tab="addons" role="tab" aria-selected="${this._activeTab === 'addons'}">${_esc(this._msg('Addons & Integrations'))}</button>
            <button class="tab-button ${this._activeTab === 'network' ? 'active' : ''}" data-tab="network" role="tab" aria-selected="${this._activeTab === 'network'}">${_esc(this._msg('Network'))}</button>
            <button class="tab-button ${this._activeTab === 'users' ? 'active' : ''}" data-tab="users" role="tab" aria-selected="${this._activeTab === 'users'}">${_esc(this._msg('Users'))}</button>
            <button class="tab-button ${this._activeTab === 'tips' ? 'active' : ''}" data-tab="tips" role="tab" aria-selected="${this._activeTab === 'tips'}">${_esc(this._msg('Tips'))}</button>
          </div>
          <div class="report-tools" id="report-tools"></div>
          <div id="content"></div>
        
        </div>
        ${this._hass?.user?.is_admin && this._config?.show_support !== false && !_localSupportDismissed() ? _renderLocalSupport(this._lang) : ''}
    `;
    if (this._lastHtml === html) return;
    this._lastHtml = html;
    this._exportDialog?.cancel();
    _disconnectConfigInventory(this);
    this.shadowRoot.innerHTML = html;
    _bindLocalIntroDismiss(this.shadowRoot);
    _bindLocalSupportDismiss(this.shadowRoot);

    this.shadowRoot.querySelectorAll('.tab-button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.shadowRoot.querySelectorAll('.tab-button').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        this._invalidateReportContext();
        this._activeTab = btn.dataset.tab;
        history.replaceState(null, '', location.pathname + '#' + this._toolId + '/' + this._activeTab);
        this._updateContent();
        _bindResponsiveTabs(this);
      });
    });

    _bindResponsiveTabs(this, tabFocus);
    this.shadowRoot.querySelector('.audit-refresh').addEventListener('click', () => {
      if (this._loading) return;
      this._lastAuditTime = Date.now();
      this._runAudit();
    });
    this._updateContent(inventoryFocus);
  }

  _updateContent(restoreInventoryFocus = null) {
    if (this._hass?.user?.is_admin !== true) { this._render(); return; }
    const content = this.shadowRoot.getElementById('content');
    if (!content) return;
    const inventoryFocus = restoreInventoryFocus || _rememberConfigInventory(this);
    _disconnectConfigInventory(this);
    this._updateReportControls();
    const refresh = this.shadowRoot.querySelector('.audit-refresh');
    if (refresh) { refresh.disabled = this._loading; refresh.textContent = this._t.refresh; }
    if (this._loading) { this._inventoryMounts = []; content.innerHTML = `<div class="loading"><div class="spinner"></div>${_esc(this._msg('Running configuration best-practices audit...'))}</div>`; return; }
    if (!this._auditData || this._auditData.error) { this._inventoryMounts = []; content.innerHTML = `<div class="error">\u26A0\uFE0F ${_esc(this._msg('Audit failed'))}${this._auditData?.error ? ': ' + _esc(this._auditData.error) : ''}</div>`; return; }
    const d = this._auditData;
    switch (this._activeTab) {
      case 'overview': content.innerHTML = this._renderOverview(d); break;
      case 'critical': content.innerHTML = this._renderFindings(d); break;
      case 'addons': content.innerHTML = this._renderAddonsAndIntegrations(d); break;
      case 'network': content.innerHTML = this._renderNetwork(d); break;
      case 'users': content.innerHTML = this._renderUsers(d); break;
      case 'tips': content.innerHTML = this._renderTips(d); break;
    }
    this._translateContent(content);
    _bindConfigInventory(this, inventoryFocus);
  }

  _renderOverview(d) {
    const report = this._auditData && Number.isFinite(this._lastScan?.getTime()) ? configReports.snapshot(d, {timestamp:this._lastScan.toISOString(),context:this._reportContext,id:'r-'+'0'.repeat(32)}) : null;
    let html = `${report ? createUiV3({language:this._lang}).statusHtml(report.status) + '<p>' + _esc(configReports.labels[this._lang].limits) + '</p>' : ''}<div class="audit-summary-section">
      <h3>Configuration best-practice summary</h3>
      <p>${d.totalChecks} checks run. Review failed and warning items first, then informational findings.</p>
      <div class="summary-grid">
        <div class="stat-card"><div class="stat-value" style="color:#f44336">${d.critCount}</div><div class="stat-label">Failed</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#ff9800">${d.warnCount}</div><div class="stat-label">Warnings</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#4caf50">${d.passCount}</div><div class="stat-label">Passed</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#03a9f4">${d.infoCount}</div><div class="stat-label">Info</div></div>
      </div>
    </div>`;
    const noSupervisor = d.findings?.info?.some(f => f.id === 'no_supervisor');
    const addonsDisplay = d.addonsAvailable === true ? String(d.addons.length) : 'N/A';
    const integrationsDisplay = d.integrationsAvailable === true ? String(d.integrations.length) : 'N/A';
    const usersDisplay = d.usersAvailable === true ? String(d.users.length) : 'N/A';
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:16px"><div style="padding:10px;background:var(--bento-bg);border-radius:8px;text-align:center"><div style="font-size:20px;font-weight:700">${addonsDisplay}</div><div style="font-size:11px;color:var(--bento-text-secondary)">${d.addonsAvailable === true ? 'Addons installed' : 'Addons unavailable'}</div></div><div style="padding:10px;background:var(--bento-bg);border-radius:8px;text-align:center"><div style="font-size:20px;font-weight:700">${integrationsDisplay}</div><div style="font-size:11px;color:var(--bento-text-secondary)">${d.integrationsAvailable === true ? 'Integrations' : 'Integrations unavailable'}</div></div><div style="padding:10px;background:var(--bento-bg);border-radius:8px;text-align:center"><div style="font-size:20px;font-weight:700">${usersDisplay}</div><div style="font-size:11px;color:var(--bento-text-secondary)">${d.usersAvailable === true ? 'User accounts' : 'User accounts unavailable'}</div></div><div style="padding:10px;background:var(--bento-bg);border-radius:8px;text-align:center"><div style="font-size:20px;font-weight:700">${d.entities}</div><div style="font-size:11px;color:var(--bento-text-secondary)">Entities</div></div><div style="padding:10px;background:var(--bento-bg);border-radius:8px;text-align:center"><div style="font-size:20px;font-weight:700">${d.totalChecks}</div><div style="font-size:11px;color:var(--bento-text-secondary)">Checks run</div></div></div>`;
    if (d.critCount > 0) { html += '<div class="section-title">\u{1F6A8} Failed Checks</div>'; d.findings.critical.forEach(f => { html += this._renderFinding(f, 'critical'); }); }
    if (d.warnCount > 0) { html += '<div class="section-title">\u26A0\uFE0F Warnings</div>'; d.findings.warning.forEach(f => { html += this._renderFinding(f, 'warning'); }); }
    if (this._lastScan) { html += `<div class="scan-info">Last scan: ${this._lastScan.toLocaleString(this._t.locale)}</div>`; }
    return html;
  }

  _renderFindings(d) {
    let html = '';
    if (d.findings.critical.length) { html += '<div class="section-title">\u{1F6A8} Failed Checks</div>'; d.findings.critical.forEach(f => { html += this._renderFinding(f, 'critical'); }); }
    if (d.findings.warning.length) { html += '<div class="section-title">\u26A0\uFE0F Warnings</div>'; d.findings.warning.forEach(f => { html += this._renderFinding(f, 'warning'); }); }
    if (d.findings.info.length) { html += '<div class="section-title">\u2139\uFE0F Informational</div>'; d.findings.info.forEach(f => { html += this._renderFinding(f, 'info'); }); }
    if (d.findings.pass.length) { html += '<div class="section-title">\u2705 Passed</div>'; d.findings.pass.forEach(f => { html += this._renderFinding(f, 'pass'); }); }
    if (!html) html = '<div class="empty-msg">No findings</div>';
    return html;
  }

  _renderFinding(f, severity) {
    const icons = { critical: '\u{1F6A8}', warning: '\u26A0\uFE0F', info: '\u2139\uFE0F', pass: '\u2705' };
    const labels = { critical: 'Failed', warning: 'Warning', info: 'Info', pass: 'Pass' };
    const resultState = f.resultState || (f.skipped ? 'not_checked' : severity === 'pass' ? 'success' : null);
    const resultBadge = resultState ? createUiV3({ language: this._lang }).statusHtml(resultState) : `<span class="finding-badge badge-${severity}">${labels[severity]}</span>`;
    return `<div class="finding ${severity}"><div class="finding-header"><span class="finding-icon">${icons[severity]}</span><span class="finding-title" data-audit-value>${_esc(this._msg(f.skipped ? f.title.replace(/ \(not checked\)$/, '') : f.title))}${f.skipped ? ' (' + this._msg('Not checked').toLowerCase() + ')' : ''}</span>${resultBadge}${f.verified ? '<span class="finding-badge badge-verified" title="Checked by the Config Auditor integration on the Home Assistant server">Server-verified</span>' : ''}</div><div class="finding-desc" data-audit-value>${_esc(this._msg(f.desc))}</div>${f.fix ? `<div class="finding-fix" data-audit-value>\u{1F4A1} ${_esc(this._msg(f.fix))}</div>` : ''}</div>`;
  }

  _renderAddonsAndIntegrations(d) {
    let html = '';
    // Addons section
    html += this._renderAddonsSection(d);
    // Integrations section
    html += this._renderIntegrationsSection(d);
    return html;
  }

  _renderAddonsSection(d) {
    if (d.addonsAvailable !== true) return '<div class="empty-msg">Add-on inventory is unavailable; installed count was not measured.</div>';
    if (!d.addons.length) {
      return '<div class="empty-msg">No addons installed</div>';
    }
    return `<div class="table-container"><table class="entity-table" data-config-inventory="addons"><thead><tr><th>Addon</th><th>Version</th><th>State</th><th>Protection</th><th>Auto-update</th><th>Host Network</th></tr></thead><tbody>${d.addons.map(a => { const prot = typeof a.protected === 'boolean' ? a.protected : null; const autoUp = typeof a.auto_update === 'boolean' ? a.auto_update : null; const hostNet = typeof a.host_network === 'boolean' ? a.host_network : null; const updateAvail = a.update_available; return `<tr data-inventory-key="${_esc(a.slug || a.name || '')}"><td>${_esc(a.name || a.slug)}${updateAvail ? ' \u2B06\uFE0F' : ''}</td><td>${_esc(a.version || '-')}${updateAvail ? ` \u2192 ${_esc(a.version_latest)}` : ''}</td><td><span class="status-dot" style="background:${a.state === 'started' ? '#4caf50' : '#9e9e9e'}"></span>${_esc(this._msg(a.state || 'unknown'))}</td><td style="color:${prot === null ? 'var(--bento-text-secondary)' : prot ? '#4caf50' : '#f44336'}">${prot === null ? this._msg('N/A') : prot ? '\u2713 ' + this._msg('On') : '\u2717 ' + this._msg('Off')}</td><td style="color:${autoUp === null ? 'var(--bento-text-secondary)' : autoUp ? '#4caf50' : '#ff9800'}">${autoUp === null ? this._msg('N/A') : autoUp ? '\u2713 ' + this._msg('On') : '\u2717 ' + this._msg('Off')}</td><td style="color:${hostNet ? '#ff9800' : 'var(--bento-text-secondary)'}">${hostNet === null ? this._msg('N/A') : hostNet ? '\u26A0 ' + this._msg('Yes') : this._msg('No')}</td></tr>`; }).join('')}</tbody></table></div>`;
  }

  _renderUsers(d) {
    if (d.usersAvailable !== true) return '<div class="empty-msg">User accounts are unavailable; check account permissions or retry as an administrator.</div>';
    if (!d.users.length) return '<div class="empty-msg">No user accounts found</div>';
    return `<div class="table-container"><table class="entity-table" data-config-inventory="users"><thead><tr><th>User</th><th>Role</th><th>Active</th><th>Local Only</th><th>System</th></tr></thead><tbody>${d.users.map(u => `<tr data-inventory-key="${_esc(u.id || u.name || '')}"><td>${this._sanitize(u.name || this._msg('Unnamed'))}</td><td>${u.is_owner ? '\u{1F451} ' + this._msg('Owner') : u.group_ids?.includes('system-admin') ? this._msg('Admin') : this._msg('User')}</td><td style="color:${u.is_active === true ? '#4caf50' : '#9e9e9e'}">${u.is_active === true ? '\u2713 ' + this._msg('Active') : u.is_active === false ? this._msg('Inactive') : this._msg('unknown')}</td><td>${u.local_only ? '\u2713 ' + this._msg('Yes') : this._msg('No')}</td><td>${u.system_generated ? '\u{1F916} ' + this._msg('Yes') : this._msg('No')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  _renderNetwork(d) {
    let html = '';

    // Remote Access
    const hasCloud = (this._hass.config?.components || []).includes('cloud');
    html += '<div class="section-title">\u{1F310} Remote Access</div>';
    if (hasCloud) {
      html += `<div class="finding info"><div class="finding-header"><span class="finding-icon">\u2139\uFE0F</span><span class="finding-title">Nabu Casa Cloud component loaded</span><span class="finding-badge badge-info">Not checked</span></div><div class="finding-desc">The cloud component is loaded. Subscription, active remote tunnel, reachability and TLS were not checked.</div></div>`;
    } else {
      html += `<div class="finding info"><div class="finding-header"><span class="finding-icon">\u2139\uFE0F</span><span class="finding-title">Cloud component not loaded</span></div><div class="finding-desc">The cloud component is not loaded. Configuration and remote access status were not checked.</div></div>`;
    }

    // URLs
    html += '<div class="section-title">\u{1F3E1} External & Internal URLs</div>';
    const externalUrl = this._hass.config?.external_url || '';
    const internalUrl = this._hass.config?.internal_url || '';

    html += `<div class="finding ${externalUrl.startsWith('http://') ? 'warning' : 'info'}">`;
    if (externalUrl.startsWith('https://')) {
      html += `<div class="finding-header"><span class="finding-icon">\u2139\uFE0F</span><span class="finding-title">External URL configured for HTTPS</span><span class="finding-badge badge-info">Not tested</span></div>`;
    } else if (externalUrl.startsWith('http://')) {
      html += `<div class="finding-header"><span class="finding-icon">\u26A0</span><span class="finding-title">External URL configured for HTTP</span><span class="finding-badge badge-warning">Review configuration</span></div>`;
    } else {
      html += `<div class="finding-header"><span class="finding-icon">\u2139\uFE0F</span><span class="finding-title">No External URL</span></div>`;
    }
    html += `<div class="finding-desc">${_esc(externalUrl || this._msg('Not configured'))}. Remote endpoint, reachability and certificate were not tested.</div></div>`;

    html += '<div class="finding info">';
    html += `<div class="finding-header"><span class="finding-icon">\u2139\uFE0F</span><span class="finding-title">Internal URL</span></div>`;
    html += `<div class="finding-desc">${_esc(internalUrl || this._msg('N/A — no internal URL configured'))}. Endpoint and certificate were not tested.</div></div>`;

    // Network info from hass.config
    const haConfig = this._hass.config || {};
    html += '<div class="section-title">\u{1F4F6} Network Info</div>';
    html += '<div class="finding info"><div class="finding-desc">';
    html += '<div style="display:grid;grid-template-columns:140px 1fr;gap:6px 12px;font-size:13px;">';
    html += `<span style="font-weight:600;color:var(--bento-text-secondary)">Location name</span><span data-audit-value>${_esc(haConfig.location_name || this._msg('N/A'))}</span>`;
    html += `<span style="font-weight:600;color:var(--bento-text-secondary)">HA Version</span><span data-audit-value>${_esc(haConfig.version || this._msg('N/A'))}</span>`;
    const hi = d.hostInfo || {};
    if (hi.hostname) html += `<span style="font-weight:600;color:var(--bento-text-secondary)">Hostname</span><span data-audit-value>${_esc(hi.hostname)}</span>`;
    if (hi.operating_system) html += `<span style="font-weight:600;color:var(--bento-text-secondary)">OS</span><span data-audit-value>${_esc(hi.operating_system)}</span>`;
    if (hi.supervisor) html += `<span style="font-weight:600;color:var(--bento-text-secondary)">Supervisor</span><span data-audit-value>${_esc(hi.supervisor)}</span>`;
    html += `<span style="font-weight:600;color:var(--bento-text-secondary)">Time zone</span><span data-audit-value>${_esc(haConfig.time_zone || this._msg('N/A'))}</span>`;
    const integrationCount = d.integrationsAvailable === true ? this._msg(d.integrations.length + ' entries') : this._msg('N/A');
    html += `<span style="font-weight:600;color:var(--bento-text-secondary)">Integrations</span><span>${integrationCount}</span>`;
    html += '</div></div></div>';

    // Network Interfaces from Supervisor
    const ifaces = d.networkInterfaces || [];
    if (ifaces.length > 0) {
      html += '<div class="section-title">\u{1F50C} Network Interfaces</div>';
      ifaces.forEach(iface => {
        const name = iface.interface || iface.name || 'unknown';
        const type = iface.type || 'unknown';
        const enabled = iface.enabled === true ? this._msg('Enabled') : iface.enabled === false ? this._msg('Disabled') : this._msg('N/A');
        const ipv4 = iface.ipv4 || {};
        const addresses = ipv4.address || [];
        const gateway = ipv4.gateway || this._msg('N/A');
        const method = ipv4.method || this._msg('N/A');
        const dns = (iface.ipv4?.nameservers || []).join(', ') || this._msg('N/A');
        const mac = iface.mac || this._msg('N/A');
        const wifi = iface.wifi || null;

        html += '<div class="finding info" style="margin-bottom:8px">';
        html += '<div class="finding-header">';
        html += '<span class="finding-icon">' + (type === 'wireless' ? '\u{1F4F6}' : '\u{1F50C}') + '</span>';
        html += '<span class="finding-title" data-audit-value>' + _esc(name) + ' (' + _esc(type) + ')</span>';
        html += '<span class="finding-badge badge-info">' + enabled + '</span>';
        html += '</div>';
        html += '<div class="finding-desc"><div style="display:grid;grid-template-columns:100px 1fr;gap:4px 12px;font-size:12px;">';
        if (addresses.length > 0) html += '<span style="font-weight:600">IP</span><span data-audit-value>' + _esc(addresses.join(', ')) + '</span>';
        html += '<span style="font-weight:600">Link status</span><span>' + (iface.connected === true ? this._msg('Connected') : iface.connected === false ? this._msg('Disconnected') : this._msg('N/A')) + '</span>';
        html += '<span style="font-weight:600">Gateway</span><span data-audit-value>' + _esc(gateway) + '</span>';
        html += '<span style="font-weight:600">DNS</span><span data-audit-value>' + _esc(dns) + '</span>';
        html += '<span style="font-weight:600">MAC</span><span data-audit-value><code style="font-size:11px">' + _esc(mac) + '</code></span>';
        html += '<span style="font-weight:600">Method</span><span data-audit-value>' + _esc(method) + '</span>';
        if (wifi) {
          html += '<span style="font-weight:600">SSID</span><span data-audit-value>' + _esc(wifi.ssid || this._msg('N/A')) + '</span>';
          html += '<span style="font-weight:600">Signal</span><span data-audit-value>' + _esc(typeof wifi.signal === 'number' && Number.isFinite(wifi.signal) ? wifi.signal + '%' : this._msg('N/A')) + '</span>';
        }
        html += '</div></div></div>';
      });
    }

    html += '<div class="section-title">\u{1F5A5}\uFE0F Exposed Addon Ports</div>';
    const exposedAddons = d.addons.filter(a => (a.ports && Object.keys(a.ports).length > 0) || (a.network && Object.keys(a.network).length > 0));
    if (exposedAddons.length === 0) {
      const portsKnown = d.addonsAvailable === true && d.addons.every(a => Object.hasOwn(a, 'ports') || Object.hasOwn(a, 'network'));
      html += portsKnown ? '<div class="empty-msg">No addons exposing ports</div>' : '<div class="empty-msg">Add-on port inventory is unavailable; exposure was not measured.</div>';
    } else {
      html += '<div class="table-container"><table class="entity-table" data-config-inventory="ports"><thead><tr><th>Addon</th><th>Ingress</th><th>Ports</th><th>State</th></tr></thead><tbody>';
      exposedAddons.forEach(a => {
        const hasIngress = a.ingress === true;
        const ports = a.ports ? Object.entries(a.ports).map(([port, config]) => `${port}${config.host_port ? `→${config.host_port}` : ''}`).join(', ') : this._msg('N/A');
        const color = hasIngress ? '#4caf50' : a.state === 'started' ? '#ff9800' : '#9e9e9e';
        html += `<tr data-inventory-key="${_esc(a.slug || a.name || '')}"><td>${_esc(a.name)}</td><td style="color:${color}">${hasIngress ? '\u2713 ' + this._msg('Yes') : '\u2717 ' + this._msg('No')}</td><td><code style="font-size:12px;background:var(--bento-bg);padding:4px 8px;border-radius:4px">${_esc(ports)}</code></td><td><span class="status-dot" style="background:${a.state === 'started' ? '#4caf50' : '#9e9e9e'}"></span>${_esc(this._msg(a.state || 'unknown'))}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }

    html += '<div class="section-title">\u{1F517} Network-Related Findings</div>';
    const networkFindings = d.findings.critical.concat(d.findings.warning).concat(d.findings.info).filter(f =>
      f.id.includes('ssl') || f.id.includes('host_network') || f.id.includes('exposed_addon_ports') ||
      f.id.includes('ports') || f.id.includes('ingress') || f.id.includes('webhook') ||
      f.id.includes('proxy') || f.id.includes('trusted') || f.id.includes('ip_ban') ||
      f.id.includes('camera') || f.id.includes('media') || f.id.includes('risky') ||
      f.id.includes('external') || f.id.includes('port_exposure') || f.id.includes('cors') ||
      f.id.includes('mqtt') || f.id.includes('network')
    );

    if (networkFindings.length === 0) {
      html += '<div class="empty-msg">No network-related findings</div>';
    } else {
      networkFindings.forEach(f => {
        const severity = d.findings.critical.includes(f) ? 'critical' : d.findings.warning.includes(f) ? 'warning' : 'info';
        html += this._renderFinding(f, severity);
      });
    }

    return html;
  }

  _renderIntegrations(d) { return this._renderIntegrationsSection(d); }

  _renderIntegrationsSection(d) {
    if (d.integrationsAvailable !== true) return '<div class="empty-msg">Integration inventory is unavailable; configured count was not measured. Check permissions or use Refresh to retry.</div>';
    if (!d.integrations.length) return '<div class="empty-msg">No integrations configured</div>';
    const knownSource = d.integrations.filter(e => typeof e.source === 'string' && e.source.length > 0).length;
    const errorInts = d.integrations.filter(e => e.state === 'setup_error');
    let html = `<div style="margin-top:20px"><h3 style="margin:0 0 12px;font-size:15px;color:var(--bento-text);">\u{1F50C} Integrations (${d.integrations.length})</h3>`;
    html += `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">`;
    html += `<div style="padding:4px 10px;background:rgba(33,150,243,0.08);border-radius:6px;font-size:11px;color:var(--bento-text-secondary);">Reported flow source: ${knownSource}</div>`;
    html += `<div style="padding:4px 10px;background:rgba(255,152,0,0.08);border-radius:6px;font-size:11px;color:var(--bento-text-secondary);">Flow source unavailable: ${d.integrations.length - knownSource}</div>`;
    if (errorInts.length > 0) html += `<div style="padding:4px 10px;background:rgba(244,67,54,0.08);border-radius:6px;font-size:11px;color:#f44336;">\u26A0 Errors: ${errorInts.length}</div>`;
    html += `</div>`;
    html += `<div class="table-container"><table class="entity-table" data-config-inventory="integrations"><thead><tr><th>Integration</th><th>Domain</th><th>Config-flow source</th><th>Status</th></tr></thead><tbody>`;
    d.integrations.forEach(e => {
      const statusColor = e.state === 'loaded' ? '#4caf50' : e.state === 'setup_error' ? '#f44336' : e.state === 'not_loaded' ? '#ff9800' : '#9e9e9e';
      const source = typeof e.source === 'string' && e.source.length > 0 ? e.source : this._msg('N/A');
      html += `<tr data-inventory-key="${_esc(e.entry_id || e.domain || '')}"><td>${_esc(e.title || e.domain)}</td><td style="font-family:monospace;font-size:12px">${_esc(e.domain)}</td>`;
      html += `<td><span class="finding-badge badge-info">${_esc(source)}</span></td>`;
      html += `<td style="color:${statusColor};font-weight:600">\u25CF ${_esc(this._msg(e.state || 'unknown'))}</td></tr>`;
    });
    html += '</tbody></table></div></div>';
    return html;
  }

    _renderTips(d) {
    return `
      <div class="tip-box"><strong>\u{1F510} Authentication</strong><br>Enable multi-factor authentication (TOTP) for all user accounts, especially owner accounts. Go to Profile \u2192 Multi-factor Authentication.</div>
      <div class="tip-box" style="margin-top:8px"><strong>\u{1F310} Network Security</strong><br>Never expose your HA instance directly to the internet. Use Cloudflare Tunnel, Nabu Casa, or a reverse proxy with SSL. Keep port 8123 behind a firewall.</div>
      <div class="tip-box" style="margin-top:8px"><strong>\u{1F504} Updates</strong><br>Keep HA Core, Supervisor, OS, and all addons up to date. Security patches are regularly released. Enable auto-update for addons when possible.</div>
      <div class="tip-box" style="margin-top:8px"><strong>\u{1F4BE} Backups</strong><br>Schedule regular automated backups and store them off-site (Google Drive, NAS, etc.). Test backup restoration periodically.</div>
      <div class="tip-box" style="margin-top:8px"><strong>\u{1F50D} Audit Trail</strong><br>Review the Logbook regularly for unexpected activity. Monitor login attempts through the System Log. Consider setting up alerts for failed login attempts.</div>
      <div class="tip-box" style="margin-top:8px"><strong>\u{1F9E9} Addon Hygiene</strong><br>Remove unused addons. Keep protection mode enabled unless absolutely needed. Review addon permissions (host network, privileged mode) periodically.</div>
      <div class="tip-box" style="margin-top:8px"><strong>\u{1F4E1} IoT Network</strong><br>Isolate IoT devices on a separate VLAN/subnet. Use firewall rules to prevent IoT devices from reaching the internet directly. This limits the blast radius of compromised devices.</div>
    `;
  }

// --- Pagination helper ---
  _renderPagination(tabName, totalItems) {
    if (!this._currentPage[tabName]) this._currentPage[tabName] = 1;
    const pageSize = this._pageSize;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.min(this._currentPage[tabName], totalPages);
    this._currentPage[tabName] = page;
    return `
      <div class="pagination">
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>&#8249; Prev</button>
        <span class="pagination-info">${page} / ${totalPages} (${totalItems})</span>
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next &#8250;</button>
        <select class="page-size-select" data-page-tab="${tabName}" data-action="page-size">
          ${[10,15,25,50].map(s => `<option value="${s}" ${s === pageSize ? 'selected' : ''}>${s}/page</option>`).join('')}
        </select>
      </div>`;
  }

  _paginateItems(items, tabName) {
    if (!this._currentPage[tabName]) this._currentPage[tabName] = 1;
    const start = (this._currentPage[tabName] - 1) * this._pageSize;
    return items.slice(start, start + this._pageSize);
  }

  _setupPaginationListeners() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('.pagination-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.pageTab;
        const page = parseInt(e.target.dataset.page);
        if (tab && page > 0) {
          this._currentPage[tab] = page;
          this._render ? this._render() : (this.render ? this.render() : this.renderCard());
        }
      });
    });
    this.shadowRoot.querySelectorAll('.page-size-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        this._pageSize = parseInt(e.target.value);
        // Reset all pages to 1
        Object.keys(this._currentPage).forEach(k => this._currentPage[k] = 1);
        this._render ? this._render() : (this.render ? this.render() : this.renderCard());
      });
    });
  }

  disconnectedCallback() {
    _disconnectConfigInventory(this); this._inventoryMounts = []; this._inventoryWidth = null;
    this._tabResizeObserver?.disconnect(); this._tabResizeObserver = null; this._tabContainerWidth = null; this.removeAttribute('data-responsive-tabs-observed');
    this._reportBrowserOff?.();
    this._reportBrowserOff = null;
    this._reportSourceEpoch = (this._reportSourceEpoch || 0) + 1;
    this._invalidateReportContext();
    this._exportDialog?.cancel();
    this._reportConnectionOff?.();
    this._reportConnectionOff = null;
    this._reportConnection = null;
    this._reportContext = null;
    this._auditData = null;
    this._savedReports = [];
    this._reportsLoaded = false;
    this._auditEpoch++;
    this._loading = false;
    this._firstHassRender = false;
  }

  setActiveTab(tabId) {
    this._invalidateReportContext();
    this._activeTab = tabId;
    this._render();
  }
}

if (!customElements.get('ha-config-auditor')) {
  customElements.define('ha-config-auditor', HAConfigAuditor);
}

console.info(
  '%c  HA-CONFIG-AUDITOR  %c v6.1.0 ',
  'background: #f44336; color: white; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'background: #ffebee; color: #f44336; font-weight: bold; padding: 2px 6px; border-radius: 0 4px 4px 0;'
);

class HaConfigAuditorEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
  }
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }
  _dispatch() {
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
  }
  _render() {
    const title = this.shadowRoot.querySelector('#cf_title');
    const value = String(this._config.title ?? 'Config Auditor');
    if (title) {
      // Keep the input and its selection when HA echoes config-changed.
      if (title.value !== value) title.value = value;
      return;
    }
    this.shadowRoot.innerHTML = `
      <style>
            :host { display:block; padding:16px; }
            h3 { margin:0 0 16px; font-size:15px; font-weight:600; color:var(--bento-text, var(--primary-text-color,#1e293b)); }
            input { box-sizing:border-box;min-height:44px;min-width:44px;max-width:100%;transition:border-color .2s; }
            input:focus-visible { outline:3px solid var(--primary-color,#1769aa);outline-offset:2px; }
            input:focus { border-color:var(--bento-primary, var(--primary-color,#3b82f6)); }
        </style>
      <h3>Config Auditor</h3>
            <div style="margin-bottom:12px;">
              <label for="cf_title" style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
              <input type="text" id="cf_title" value="${_esc(value)}"
                style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
            </div>
    `;
        const f_title = this.shadowRoot.querySelector('#cf_title');
        if (f_title) f_title.addEventListener('input', (e) => {
          this._config = { ...this._config, title: e.target.value };
          this._dispatch();
        });
  }
  connectedCallback() { this._render(); }
}
if (!customElements.get('ha-config-auditor-editor')) { customElements.define('ha-config-auditor-editor', HaConfigAuditorEditor); }

})();

window.customCards = window.customCards || [];
window.customCards.push({ type: 'ha-config-auditor', name: 'Config Auditor', description: 'Configuration best-practices audit tool for Home Assistant', preview: true });
