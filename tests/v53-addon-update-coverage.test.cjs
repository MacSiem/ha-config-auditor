'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { JSDOM, VirtualConsole }=require('jsdom');
const source=fs.readFileSync(process.env.AUDIT_SOURCE || path.join(__dirname,'../ha-config-auditor.js'),'utf8');
async function audit(addons,language='en') {
 const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',virtualConsole:new VirtualConsole()});
 try {
  dom.window.eval(source);
  const card=dom.window.document.createElement('ha-config-auditor');
  card.setConfig({type:'custom:ha-config-auditor'});
  dom.window.document.body.append(card);
  const conn=new dom.window.EventTarget();conn.connected=true;
  const hass={user:{id:'synthetic-admin',is_admin:true},language,states:{},themes:{darkMode:false},
    config:{components:[],version:'2026.10.0'},connection:conn,
    callWS:async msg=>{
      if(msg.type==='supervisor/api'&&msg.endpoint==='/addons')return {addons};
      if(msg.type==='ha_config_auditor/audit')return {version:'6.1.0',findings:[]};
      if(msg.type==='config/auth/list'||msg.type==='config_entries/get'||msg.type==='auth/refresh_tokens')return [];
      throw new Error('Fixture not available');
    },
    callApi:async()=>{throw new Error('Fixture not available')},
    callService:async()=>({})};
  card.hass=hass;
  for(let i=0;i<120&&(card._loading||!card._auditData);i++)await new Promise(r=>setTimeout(r,10));
  assert.ok(!card._loading&&card._auditData&&!card._auditData.error,'real active audit completed');
  const d=card._auditData;
  const findings=[...d.findings.info,...d.findings.warning,...d.findings.pass,...d.findings.critical];
  const found=findings.filter(f=>f.id==='addon_updates');
  const en=card._renderFindings(d);
  const addonsEN=card._renderAddonsSection(d);
  card.hass={...hass,language:'pl'};
  const pl=card._renderFindings(d);
  const addonsPL=card._renderAddonsSection(d);
  const overview=card._renderOverview(d);
  return {data:d,found,en,pl,overview,addonsEN,addonsPL,source:card._msg('Add-on update status not checked')};
 } finally {dom.window.close()}
}
test('missing availability must not become success, appears in actual Overview and PL/EN',async()=>{
 const r=await audit([{name:'PRIVATE_CANARY',version:'1.0'}]);
 assert.equal(r.found.length,1);
 assert.equal(r.found[0].resultState,'not_checked');
 assert.equal(r.found[0].verified,false);
 assert.equal(r.data.findings.pass.some(f=>f.id==='addon_updates'),false);
 assert.match(r.en,/Add-on update status not checked/);
 assert.match(r.pl,/Nie sprawdzono aktualizacji dodatków/);
 assert.match(r.overview,/Nie sprawdzono aktualizacji dodatków/);
 assert.doesNotMatch(r.en+r.pl,/PRIVATE_CANARY/);
});
test('null and string false are not verified booleans',async()=>{
 const r=await audit([{name:'A',update_available:null},{name:'B',update_available:'false'},{name:'C',update_available:false}]);
 assert.equal(r.found.length,1);
 assert.equal(r.found[0].resultState,'not_checked');
 assert.match(r.en,/2 of 3/);
 assert.match(r.pl,/2 z 3/);
});
test('all explicitly false on non-empty inventory means verified current',async()=>{
 const r=await audit([{name:'A',update_available:false},{name:'B',update_available:false}]);
 assert.equal(r.found.length,1);
 assert.equal(r.found[0].id,'addon_updates');
 assert.ok(r.data.findings.pass.includes(r.found[0]));
 assert.doesNotMatch(r.en,/Add-on update status not checked/);
 assert.match(r.pl,/Wszystkie dodatki są aktualne/);
});
test('known available update stays warning with explicit missing coverage and no false pass',async()=>{
 const r=await audit([{name:'Known',version:'1.0',version_latest:'1.1',update_available:true},{name:'Other',update_available:'false'}]);
 assert.equal(r.found.length,1);
 assert.ok(r.data.findings.warning.includes(r.found[0]));
 assert.match(r.en,/Known updates/);
 assert.match(r.pl,/Potwierdzone aktualizacje/);
 assert.match(r.en,/1 of 2/);
 assert.match(r.pl,/1 z 2/);
 assert.equal(r.data.findings.pass.some(f=>f.id==='addon_updates'),false);
});
test('empty confirmed inventory and unavailable inventory never claim all up to date',async()=>{
 for(const a of [[],undefined]){
  const r=await audit(a);
  assert.equal(r.data.findings.pass.some(f=>f.id==='addon_updates'),false);
 }
});

test('active Add-ons table uses confirmed boolean true only, in PL and EN', async () => {
  const items=[
    {name:'KnownUpdate',slug:'known',version:'1.0',version_latest:'1.1',update_available:true},
    {name:'TextFalse',slug:'text',version:'1.0',version_latest:'9.9',update_available:'false'},
    {name:'NumericOne',slug:'one',version:'1.0',version_latest:'9.9',update_available:1},
    {name:'NullStatus',slug:'null',version:'1.0',version_latest:'9.9',update_available:null},
    {name:'NoStatus',slug:'missing',version:'1.0',version_latest:'9.9'},
    {name:'VerifiedFalse',slug:'false',version:'1.0',version_latest:'9.9',update_available:false},
  ];
  const r=await audit(items);
  for(const html of [r.addonsEN,r.addonsPL]) {
    assert.match(html,/KnownUpdate ⬆️/); // Verified update is visible.
    assert.match(html,/1.0 → 1.1/);
    assert.equal((html.match(/⬆️/g) || []).length,1);
    for(const name of ['TextFalse','NumericOne','NullStatus','NoStatus','VerifiedFalse']) {
      assert.match(html,new RegExp(name));
      assert.doesNotMatch(html,new RegExp(name+' ⬆️'));
    }
    assert.equal(html.includes('9.9'),false); // No speculative target version.
  }
  assert.ok(r.data.findings.warning.some(x=>x.id==='addon_updates'));
  assert.equal(r.data.findings.pass.some(x=>x.id==='addon_updates'),false);
});
test('explicit false and missing availability never get an upgrade arrow', async () => {
  for(const state of [false,'false',null,0,undefined]) {
    const item={name:'Single',slug:'single',version:'2.0',version_latest:'9.9'};
    if(state!==undefined) item.update_available=state;
    const r=await audit([item]);
    assert.doesNotMatch(r.addonsEN,/⬆️/); assert.equal(r.addonsEN.includes('9.9'),false);
    assert.doesNotMatch(r.addonsPL,/⬆️/); assert.equal(r.addonsPL.includes('9.9'),false);
    assert.equal(r.data.findings.warning.some(x=>x.id==='addon_updates'),false);
  }
});
