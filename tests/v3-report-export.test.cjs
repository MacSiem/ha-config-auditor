'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createAuditReports } = require('../shared/ha-config-reports.js');
const reports = createAuditReports();
const NOW = '2026-10-12T12:00:00.000Z';
const ctx = { owner: 'c-' + '1'.repeat(32), instance: 'c-' + '2'.repeat(32), scope: 'c-' + '3'.repeat(32) };
const data = (findings = {}) => ({ findings: { critical: [], warning: [], info: [], pass: [], ...findings }, serverVersion: '6.0.2', addonsAvailable: true, addons: [], integrationsAvailable: true, integrations: [], entities: 0 });
const snap = d => reports.snapshot(d, { timestamp: NOW, context: ctx, id: 'r-' + '4'.repeat(32) });
test('explicit clean controls differ from absent or not-checked controls; incomplete audit stays Partial', () => {
 const a = snap(data({ pass: [{ id: 'os_update', resultState: 'success' }] }));
 assert.equal(a.checks.find(c => c.id === 'os_update').status, 'success');
 const b = snap(data({ info: [{ id: 'os_update', resultState: 'not_checked', verified: false }] }));
 assert.equal(b.checks.find(c => c.id === 'os_update').status, 'not_checked');
 assert.equal(b.status, 'partial'); assert.ok(b.counts.not_checked > 0);
 assert.equal(b.checks.find(c => c.id === 'core_update').status, 'not_checked');
 assert.equal(snap(data()).status, 'partial');
});
test('new, still present and resolved require the same explicit check; missing and skipped stay unknown', () => {
 const baseline = snap(data({ warning: [{ id: 'core_update' }, { id: 'os_update' }, { id: 'server_http_ip_ban', verified: true }], pass: [{id:'supervisor_update'}] }));
 const current = snap(data({ warning: [{ id: 'core_update' }, { id: 'supervisor_update' }], pass: [{ id: 'os_update' }] }));
 const changes = reports.compare(baseline, current);
 assert.equal(changes.compatible, true);
 const change = id => changes.checks.find(c => c.id === id).change;
 assert.equal(change('core_update'), 'still_present'); assert.equal(change('os_update'), 'resolved');
 assert.equal(change('supervisor_update'), 'new'); assert.equal(change('server_http_ip_ban'), 'unknown');
 const skipped = snap(data({ info: [{ id: 'os_update', skipped: true }] }));
 assert.equal(reports.compare(baseline, skipped).checks.find(c => c.id === 'os_update').change, 'unknown');
});
test('scope, method, schema, owner, instance and unconfirmed context prevent comparison', () => {
 const a = snap(data());
 for (const b of [{ ...a, method: 'other' }, { ...a, schema: 2 }, { ...a, context: { ...ctx, owner: 'c-'+'5'.repeat(32) } }, { ...a, context: { ...ctx, instance: 'c-'+'5'.repeat(32) } }, { ...a, context: { ...ctx, scope: 'c-'+'5'.repeat(32) } }, { ...a, context: null }]) {
  const result = reports.compare(a, b); assert.equal(result.compatible, false); assert.equal(result.checks.length, 0); assert.ok(result.reason);
 }
});
test('retention is 20 snapshots / 30 days; reload validates typed fields and rejects canary injection', () => {
 const a = snap(data());
 const list = Array.from({length:25},(_,i)=>({...a,id:'r-'+i.toString(16).padStart(32,'0'),timestamp:new Date(Date.parse(NOW)-i*1000).toISOString()}));
 list.push({...a,id:'r-'+'f'.repeat(32),timestamp:'2025-01-01T00:00:00.000Z'});
 const retained = reports.retain(list, Date.parse(NOW)); assert.equal(retained.length,20);
 const loaded = reports.load(JSON.stringify({schema:1,reports:[{...a,raw_config:'CANARY',checks:[...a.checks,{id:'server_admin_CANARY',status:'success'}]}]}),Date.parse(NOW));
 assert.equal(loaded.length,0, 'invalid check schema must not enter browser report state');
 const valid=reports.load(JSON.stringify({schema:1,reports:[{...a,raw_config:'CANARY'}]}),Date.parse(NOW));
 assert.equal(valid.length,1); assert.doesNotMatch(JSON.stringify(valid),/CANARY/);
});
test('both private modes exclude raw findings, auth users, names, addresses, tokens, dynamic IDs and payloads', () => {
 const dangerous = data({ critical:[{id:'server_person_CANARY',title:'CANARY',desc:'CANARY'}], warning:[{id:'core_update',title:'CANARY',desc:'CANARY',fix:'CANARY'}] });
 dangerous.users=[{name:'CANARY',token:'CANARY'}];dangerous.hostInfo={hostname:'CANARY'};dangerous.addons=[{name:'CANARY'}];dangerous.integrations=[{domain:'CANARY'}];dangerous.entities=0;
 const a=snap(dangerous);
 for(const includePrivate of [false,true]) for(const format of ['json','csv','txt']) {
  const output=reports.serialize(a,{format,includePrivate,language:'pl',privateCounts:reports.privateCounts(dangerous)});
  assert.doesNotMatch(output,/CANARY/);assert.match(output,/partial/);assert.match(output,/not_checked/);
  if(format==='json'){ const parsed=JSON.parse(output);assert.equal(parsed.counts.success,0);assert.equal(parsed.privateInventory===undefined,!includePrivate);if(includePrivate)assert.equal(parsed.privateInventory.entities,0); }
 }
 assert.equal(reports.csvCell(' =SUM(A1)'), '"\' =SUM(A1)"');
 assert.equal(reports.privateCounts({...dangerous,addonsAvailable:false}).addons,null);
});
const flush = async () => { for(let i=0;i<100;i++) await new Promise(r=>setImmediate(r)); };
async function fixture(language='en') {
 const dom=new JSDOM('',{runScripts:'dangerously',pretendToBeVisual:true,url:'http://qa.invalid/',virtualConsole:new VirtualConsole()});
 dom.window.Blob=globalThis.Blob;dom.window.AbortController=globalThis.AbortController;
 dom.window.eval(fs.readFileSync(path.join(__dirname,'../ha-config-auditor.js'),'utf8'));
 const card=dom.window.document.createElement('ha-config-auditor');card.setConfig({title:'QA'});dom.window.document.body.append(card);
 const connection={connected:true};let reads=0;
 const hass={language,connection,user:{id:'CANARY-ADMIN',is_admin:true},states:{},config:{components:[],version:'2026.10.0'},themes:{},callWS:async m=>{reads++;if(m.type==='config/auth/list'||m.type==='config_entries/get'||m.type==='auth/refresh_tokens')return [];if(m.type==='ha_config_auditor/audit')return {version:'6.0.2',findings:[{id:'http_ip_ban',status:'pass',title:'CANARY',detail:'CANARY'}]};throw Error('Unavailable');}};
 card.hass=hass;await flush();assert.equal(card._loading,false);
 const find=k=>card.shadowRoot.querySelector('[data-ha-tools-export]')?.shadowRoot.querySelector(`[data-export="${k}"]`);
 return {dom,card,hass,reads:()=>reads,find,cleanup:()=>dom.window.close()};
}
test('actual audit is saved manually only; new namespace preserves old keys; opening/export adds no reads',async()=>{
 const f=await fixture();try{
 const {card,dom}=f;const reads=f.reads();dom.window.localStorage.setItem('ha-config-auditor-default','{"lastScan":"keep"}');dom.window.localStorage.setItem('neighbor','keep');
 assert.equal(card._savedReports.length,0);assert.equal(dom.window.localStorage.getItem(card._reportsKey()),null);
 card.shadowRoot.querySelector('.report-save').click();assert.equal(card._savedReports.length,1);assert.equal(dom.window.localStorage.getItem('neighbor'),'keep');assert.equal(dom.window.localStorage.getItem('ha-config-auditor-default'),'{"lastScan":"keep"}');
 assert.doesNotMatch(dom.window.localStorage.getItem(card._reportsKey()),/CANARY/);
 const opener=card.shadowRoot.querySelector('.report-export');opener.click();await flush();assert.equal(f.find('private').checked,false);assert.equal(f.reads(),reads);
 assert.equal(JSON.parse(f.find('preview').textContent).status,'partial');assert.equal(f.find('status').dataset.resultState,'partial');
 f.find('cancel').click();assert.equal(card.shadowRoot.activeElement,opener);
 }finally{f.cleanup();}
});
test('consumer exact preview is the Blob; download initiated stays Unconfirmed and cannot replay',async()=>{
 const f=await fixture('pl');try{
 const downloads=[];f.card._downloadReport=async x=>{downloads.push(x);return {outcome:'initiated'};};
 f.card.shadowRoot.querySelector('.report-save').click();f.card.shadowRoot.querySelector('.report-export').click();await flush();
 const preview=f.find('preview').textContent;f.find('save').click();await flush();assert.equal(downloads.length,1);assert.equal(downloads[0].serialized,preview);assert.equal(await downloads[0].blob.text(),preview);assert.equal(f.find('status').dataset.resultState,'unconfirmed');assert.match(f.find('message').textContent,/nie jest potwierdzony/);f.find('save').click();await flush();assert.equal(downloads.length,1);
 }finally{f.cleanup();}
});
test('selection, source, disconnect and role transitions drop export bytes and private consent; household adds no storage access',async()=>{
 const f=await fixture();try{
 const card=f.card;card.shadowRoot.querySelector('.report-save').click();card.shadowRoot.querySelector('.report-export').click();await flush();
 f.find('private').checked=true;f.find('private').dispatchEvent(new f.dom.window.Event('change'));f.find('refresh').click();await flush();assert.ok(f.find('preview').textContent);
 card._invalidateReportContext();assert.equal(f.find('preview').textContent,'');assert.equal(f.find('private').checked,false);
 let storageCalls=0;const proto=f.dom.window.Storage.prototype;const get=proto.getItem,set=proto.setItem;proto.getItem=function(...args){storageCalls++;return get.apply(this,args)};proto.setItem=function(...args){storageCalls++;return set.apply(this,args)};
 card.hass={...f.hass,user:{id:'household',is_admin:false}};assert.equal(card._savedReports.length,0);assert.equal(card._reportContext,null);assert.equal(card.shadowRoot.querySelector('.report-save'),null);assert.equal(storageCalls,0);
 }finally{f.cleanup();}
});
test('cancel while adapter is pending latches export intent until settled; no duplicate download',async()=>{
 const f=await fixture();try{
 let settle;let calls=0;f.card._downloadReport=()=>{calls++;return new Promise(r=>settle=r)};
 f.card.shadowRoot.querySelector('.report-save').click();f.card.shadowRoot.querySelector('.report-export').click();await flush();f.find('save').click();await flush();f.find('cancel').click();f.card.shadowRoot.querySelector('.report-export').click();await flush();assert.equal(f.find('save').disabled,true);assert.equal(f.find('refresh').disabled,true);assert.equal(calls,1);settle({outcome:'unknown'});await flush();assert.equal(calls,1);assert.equal(f.find('save').disabled,true);
 }finally{f.cleanup();}
});
test('reloading restores sanitized local reports but does not invent user/instance continuity',async()=>{
 const first=await fixture();let raw;
 try {first.card.shadowRoot.querySelector('.report-save').click();raw=first.dom.window.localStorage.getItem(first.card._reportsKey());}finally{first.cleanup();}
 const second=await fixture();try{
 second.dom.window.localStorage.setItem(second.card._reportsKey(),raw);second.card._loadManualReports();second.card._updateReportControls();assert.equal(second.card._savedReports.length,1);
 const old=second.card._savedReports[0];second.card.shadowRoot.querySelector('.report-save').click();second.card._reportBaseline=old.id;
 const comparison=second.card._selectedComparison();assert.equal(comparison.compatible,false);assert.match(comparison.reason,/session|instance/);
 assert.doesNotMatch(raw,/CANARY|privateInventory|users|names|addresses/);
 }finally{second.cleanup();}
});
test('offline transition prevents saves and export; reconnect invalidates old baseline identity',async()=>{
 const f=await fixture();try{
 const card=f.card;card.shadowRoot.querySelector('.report-save').click();const old=card._savedReports[0];card.shadowRoot.querySelector('.report-export').click();await flush();assert.ok(f.find('preview').textContent);
 f.hass.connection.connected=false;card.hass=f.hass;assert.equal(card._auditData,null);assert.equal(card._reportContext,null);assert.equal(f.find('preview').textContent,'');assert.equal(f.find('private').checked,false);
 const stored=f.dom.window.localStorage.getItem(card._reportsKey());card._saveManualReport();assert.equal(f.dom.window.localStorage.getItem(card._reportsKey()),stored);
 f.hass.connection.connected=true;card.hass=f.hass;await flush();card._exportDialog.cancel();card.shadowRoot.querySelector('.report-save').click();card._reportBaseline=old.id;assert.equal(card._selectedComparison().compatible,false);
 }finally{f.cleanup();}
});
test('unverified, contradictory and six authored status codes never produce false success',()=>{
 const r=snap(data({pass:[{id:'os_update',resultState:'success',skipped:true},{id:'server_http_ip_ban',verified:false}],info:[{id:'core_update',resultState:'no_data'}]}));
 assert.equal(r.checks.find(c=>c.id==='os_update').status,'not_checked');assert.equal(r.checks.find(c=>c.id==='server_http_ip_ban').status,'not_checked');assert.equal(r.checks.find(c=>c.id==='core_update').status,'no_data');assert.equal(r.counts.success,0);
 assert.deepEqual(Object.keys(r.counts),['success','partial','unconfirmed','error','not_checked','no_data']);
 const knownClear=snap(data({pass:[{id:'core_update'}]}));const unknown=snap(data());const problem=snap(data({warning:[{id:'core_update'}]}));
 assert.equal(reports.compare(knownClear,problem).checks.find(c=>c.id==='core_update').change,'new');assert.equal(reports.compare(unknown,problem).checks.find(c=>c.id==='core_update').change,'unknown');
});
