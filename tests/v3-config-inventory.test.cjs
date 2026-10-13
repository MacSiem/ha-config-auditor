// Tests-first W3 behavior specification. Source-only packet: NOT EXECUTED.
// ResizeObserver deliveries specify content widths; no geometry mocks or CSS acceptance.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const inventories = [['addons','addons',6,2],['addons','integrations',4,3],['users','users',5,2],['network','ports',4,3]];
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
async function fixture(language='en', observed=true, entry='ha-config-auditor.js') {
  const dom = new JSDOM('', {runScripts:'dangerously',pretendToBeVisual:true,url:'http://synthetic.invalid/',virtualConsole:new VirtualConsole()});
  const observers=[], requests=[];
  if (observed) dom.window.ResizeObserver=class {
    constructor(callback) {this.callback=callback;this.disconnected=false;observers.push(this);}
    observe(target) {this.target=target;}
    disconnect() {this.disconnected=true;}
    deliver(width) {this.callback([{target:this.target,contentRect:{width}}]);}
  };
  dom.window.eval(readFileSync(join(__dirname,'..',entry),'utf8'));
  const card=dom.window.document.createElement('ha-config-auditor');
  card.setConfig({show_support:false,unknown_setting:{keep:'fixture'}});dom.window.document.body.append(card);
  const addons=[
    {slug:'alpha',name:'Network <safe> '+'Long-name-'.repeat(12),version:'User',version_latest:'2',update_available:true,state:'started',protected:true,auto_update:false,host_network:false,ingress:true,ports:{'8123/tcp':{host_port:18123}}},
    {slug:'beta',name:'Stopped add-on',version:'1',state:'stopped',protected:false,auto_update:true,host_network:true,ingress:false,ports:{'5353/udp':{host_port:5353}}},
    {slug:'gamma',name:'Missing state',version:'1',network:{'9999/tcp':null}}
  ];
  const users=[{id:'u1',name:'Warning',is_owner:true,is_active:true,local_only:true,system_generated:false},
    {id:'u2',name:'Inactive admin',group_ids:['system-admin'],is_active:false,local_only:false,system_generated:true},
    {id:'u3',name:'Missing active',group_ids:[]}];
  const integrations=[{entry_id:'i1',title:'Tips',domain:'Warning',source:'User',state:'loaded'},
    {entry_id:'i2',title:'Broken integration',domain:'second',source:'import',state:'setup_error'},
    {entry_id:'i3',title:'Missing integration state',domain:'third'}];
  const hass={language,user:{id:'w3-admin',is_admin:true},themes:{},states:{},config:{components:[],version:'2026.9.4'},
    callWS:async m=>{requests.push(m);if(m.type==='config/auth/list')return users;if(m.type==='config_entries/get')return integrations;
      if(m.type==='supervisor/api' && m.endpoint==='/addons')return {addons};throw Error('Synthetic unavailable');},
    callApi:async (...args)=>{requests.push(args);throw Error('Synthetic unavailable');}};
  card.hass=hass;
  for(let i=0;i<100 && (card._loading || i<3);i++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(card._auditData && !card._loading,'real audit fixture settled');
  const data=card._auditData;freeze(data);const snapshot=JSON.stringify(data), root=card.shadowRoot;
  const choose=tab=>root.querySelector('.tabs [data-tab="'+tab+'"]').click();
  const table=kind=>root.querySelector('table[data-config-inventory="'+kind+'"]') || Array.from(root.querySelectorAll('#content .entity-table')).find(table=>table.tHead.rows[0].cells.length==={addons:6,integrations:4,users:5,ports:4}[kind]) || null;
  const records=kind=>Array.from(root.querySelectorAll('.ht-config-records[data-inventory="'+kind+'"] > details'));
  const observer=()=>observers.findLast(o=>!o.disconnected && o.target===root.getElementById('content'));
  const resize=width=>{assert.ok(observer(),'observes actual card content');observer().deliver(width);};
  return {dom,card,hass,root,requests,observers,choose,table,records,observer,resize,data,snapshot};
}
for(const entry of ['ha-config-auditor.js','custom_components/ha_config_auditor/www/ha-config-auditor.js'])
for(const language of ['en','pl']) test(`${entry}: all four inventories keep every field, name and actual state (${language})`,async()=>{
  const f=await fixture(language,true,entry);try {
    const reads=f.requests.length;
    for(const [tab,kind,count,stateColumn] of inventories) {
      f.choose(tab);f.resize(500);const table=f.table(kind);assert.ok(table);
      const expected=Array.from(table.tBodies[0].rows,row=>Array.from(row.cells,cell=>cell.textContent));
      const headers=Array.from(table.tHead.rows[0].cells,cell=>cell.textContent.trim());
      const nodes=Array.from(table.tBodies[0].rows[0].cells,cell=>Array.from(cell.childNodes));
      f.resize(499.5);assert.equal(table.parentElement.hidden,true);
      assert.equal(f.records(kind).length,3);
      f.records(kind).forEach((record,i)=>{
        const summary=record.querySelector('summary');assert.equal(summary.firstElementChild.textContent,expected[i][0]);
        assert.equal(summary.querySelector('[data-record-state]').textContent,expected[i][stateColumn].trim());
        if(kind==='users')assert.equal(summary.querySelector('[data-record-role]').textContent,expected[i][1]);
        assert.deepEqual(Array.from(record.querySelectorAll('dt'),x=>x.textContent),headers);
        assert.deepEqual(Array.from(record.querySelectorAll('dd'),x=>x.textContent),expected[i]);
        assert.equal(record.querySelectorAll('dd').length,count);assert.equal(record.open,false);
      });
      assert.equal(f.records(kind)[2].querySelector('[data-record-state]').textContent,kind==='integrations'?(language==='pl'?'● Nieznany':'● unknown'):(language==='pl'?'Nieznany':'unknown'));
      // All original values are nodes moved into one visible representation, never cloned actions.
      nodes.forEach((children,i)=>assert.deepEqual(Array.from(f.records(kind)[0].querySelectorAll('dd')[i].childNodes),children));
      f.resize(500);assert.equal(f.table(kind),table);assert.equal(table.parentElement.hidden,false);
      assert.deepEqual(Array.from(table.tBodies[0].rows,row=>Array.from(row.cells,cell=>cell.textContent)),expected);
    }
    assert.equal(f.root.querySelector('safe'),null);assert.equal(f.requests.length,reads);
    assert.equal(f.card._auditData,f.data);assert.equal(JSON.stringify(f.data),f.snapshot);
  } finally {f.dom.window.close();}
});

test('positive threshold, focus transfer, disclosure, live nodes and outside caret survive width changes',async()=>{
 const f=await fixture();try {
  f.choose('addons');f.resize(500);const table=f.table('addons'),reads=f.requests.length;
  for(const width of [0,-1,NaN,Infinity]){f.resize(width);assert.equal(table.parentElement.hidden,false);}
  f.resize(499.99);const record=f.records('addons')[0],summary=record.querySelector('summary');record.open=true;summary.focus();
  f.resize(500);assert.ok(f.root.activeElement);assert.equal(f.root.activeElement.closest('[hidden]'),null);
  f.resize(200);assert.equal(f.records('addons')[0],record);assert.equal(record.open,true);assert.equal(f.root.activeElement,summary);
  // Synthetic control probes generic node movement/handlers; it is not a new product field.
  const input=f.dom.window.document.createElement('input');input.type='text';input.value='unsaved draft';
  f.root.querySelector('.card').append(input);input.focus();input.setSelectionRange(2,7,'backward');
  f.resize(900);f.resize(320);assert.equal(f.root.activeElement,input);
  assert.deepEqual([input.value,input.selectionStart,input.selectionEnd,input.selectionDirection],['unsaved draft',2,7,'backward']);
  for(const width of [0,NaN]){f.resize(width);assert.equal(table.parentElement.hidden,true);}
  assert.equal(f.requests.length,reads);assert.equal(JSON.stringify(f.data),f.snapshot);
 }finally{f.dom.window.close();}
});

test('ordinary repaint and PL/EN retain record disclosure, focus and unchanged original value nodes',async()=>{
 const f=await fixture();try {
  f.choose('addons');f.resize(390);const record=f.records('addons')[1],summary=record.querySelector('summary');
  const raw=record.querySelector('dd').firstChild;record.open=true;summary.focus();const old=f.observer(),reads=f.requests.length;
  f.card._updateContent();assert.equal(old.disconnected,true);assert.equal(f.records('addons')[1],record);
  assert.equal(record.open,true);assert.equal(f.root.activeElement,summary);assert.equal(record.querySelector('dd').firstChild,raw);
  old.deliver(900);assert.equal(f.table('addons').parentElement.hidden,true);
  for(const language of ['pl','en','pl']) {
    f.card.hass={...f.hass,language};assert.equal(f.records('addons')[1],record);assert.equal(record.open,true);
    assert.equal(f.root.activeElement,summary);assert.equal(record.querySelector('dd').firstChild,raw);
    assert.equal(record.querySelector('[data-record-state]').textContent,language==='pl'?'Zatrzymany':'stopped');
    assert.equal(record.querySelectorAll('dt')[2].textContent,language==='pl'?'Stan':'State');
  }
  assert.equal(f.requests.length,reads);assert.equal(JSON.stringify(f.data),f.snapshot);
 }finally{f.dom.window.close();}
});

test('unavailable, empty and failed sources keep distinct existing labels and never create records',async()=>{
 const f=await fixture();try {
  const cases=[['addons','addonsAvailable','addons','Add-on inventory is unavailable; installed count was not measured.','No addons installed'],
   ['addons','integrationsAvailable','integrations','Integration inventory is unavailable; configured count was not measured. Check permissions or use Refresh to retry.','No integrations configured'],
   ['users','usersAvailable','users','User accounts are unavailable; check account permissions or retry as an administrator.','No user accounts found']];
  for(const [tab,flag,kind,unavailable,empty] of cases) {
   f.card._auditData=freeze({...f.data,[flag]:false,[kind]:[]});f.choose(tab);
   assert.ok(f.root.getElementById('content').textContent.includes(unavailable));assert.equal(f.table(kind),null);
   f.card._auditData=freeze({...f.data,[flag]:true,[kind]:[]});f.card._updateContent();
   assert.ok(f.root.getElementById('content').textContent.includes(empty));assert.equal(f.records(kind).length,0);
  }
  for(const available of [false,true]) {
   f.card._auditData=freeze({...f.data,addonsAvailable:available,addons:[]});f.choose('network');
   assert.ok(f.root.getElementById('content').textContent.includes(available?'No addons exposing ports':'Add-on port inventory is unavailable; exposure was not measured.'));
   assert.equal(f.table('ports'),null);
  }
  f.card._auditData={error:'Synthetic error'};f.card._updateContent();assert.match(f.root.getElementById('content').textContent,/Audit failed: Synthetic error/);
  assert.equal(f.root.querySelector('.ht-config-records'),null);assert.equal(f.observer(),undefined);
 }finally{f.dom.window.close();}
});

test('navigation, W1/W2 picker, role loss, detach and reconnect retire stale inventory observers',async()=>{
 const f=await fixture();try {
  const tabs=['overview','critical','addons','network','users','tips'];
  const picker=f.root.querySelector('#ha-tools-tab-picker');assert.deepEqual(Array.from(picker.options,o=>o.value),tabs);
  const reads=f.requests.length;f.choose('addons');f.resize(390);const old=f.observer();
  picker.value='tips';picker.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));
  assert.equal(f.card._activeTab,'tips');assert.equal(old.disconnected,true);old.deliver(390);
  assert.equal(f.root.querySelector('.ht-config-records'),null);assert.equal(f.requests.length,reads);
  f.choose('users');f.resize(390);const current=f.observer();f.card.remove();assert.equal(current.disconnected,true);
  current.deliver(900);assert.equal(f.table('users').parentElement.hidden,true);
  f.dom.window.document.body.append(f.card);f.card.hass={...f.hass};
  for(let i=0;i<100&&f.card._loading;i++)await new Promise(resolve=>setImmediate(resolve));
  f.choose('users');f.resize(500);assert.notEqual(f.observer(),current);assert.equal(f.table('users').parentElement.hidden,false);
  const active=f.observer(),afterReconnect=f.requests.length;
  f.card.hass={...f.hass,user:{id:'w3-admin',is_admin:false}};
  assert.equal(active.disconnected,true);active.deliver(250);assert.equal(f.root.querySelector('.ht-config-records'),null);
  assert.equal(f.card._auditData,null);assert.equal(f.requests.length,afterReconnect);
 }finally{f.dom.window.close();}
});

test('no observer keeps all wide inventory cells and every native navigation option',async()=>{
 const f=await fixture('en',false);try {
  const reads=f.requests.length;
  for(const [tab,kind,count]of inventories){f.choose(tab);assert.equal(f.table(kind).parentElement.hidden,false);
   assert.equal(f.table(kind).tBodies[0].rows[0].cells.length,count);
   if(f.records(kind).length)assert.equal(f.records(kind)[0].parentElement.hidden,true);}
  assert.equal(f.root.querySelector('#ha-tools-tab-picker').options.length,6);assert.equal(f.requests.length,reads);
 }finally{f.dom.window.close();}
});
