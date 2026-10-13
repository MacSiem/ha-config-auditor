// SOURCE-ONLY SUPPLEMENT, authored AFTER runtime source (not tests-first).
// Exercises unchanged node handlers/caret and record reconciliation; NOT EXECUTED.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
function fixture() {
 const dom=new JSDOM('',{runScripts:'dangerously',pretendToBeVisual:true,url:'http://synthetic.invalid/',virtualConsole:new VirtualConsole()});
 const observers=[];
 dom.window.ResizeObserver=class {
  constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}
  observe(target){this.target=target;}disconnect(){this.disconnected=true;}
  deliver(width){this.callback([{target:this.target,contentRect:{width}}]);}
 };
 dom.window.eval(readFileSync(join(__dirname,'../ha-config-auditor.js'),'utf8'));
 const card=dom.window.document.createElement('ha-config-auditor');dom.window.document.body.append(card);
 let reads=0;
 card._hass={language:'en',user:{id:'synthetic-admin',is_admin:true},config:{components:[]},states:{},callWS:async()=>{reads++;throw Error('Unexpected API read');}};
 card._lang='en';card._loading=false;card._activeTab='addons';card._config={show_support:false};
 const addon=(slug)=>Object.freeze({slug,name:'Raw '+slug,version:'1',state:'started',protected:true,auto_update:false,host_network:false,ports:{}});
 card._auditData=Object.freeze({findings:{critical:[],warning:[],info:[],pass:[]},addonsAvailable:true,addons:Object.freeze([addon('a'),addon('b')]),integrationsAvailable:true,integrations:[],usersAvailable:true,users:[],entities:0,totalChecks:0});
 // These inventory tables currently contain no controls. A stable synthetic native
 // input catches accidental clones/replacements that text parity cannot detect.
 const render=card._renderAddonsSection;
 card._renderAddonsSection=function(data){return render.call(this,data).replace('</td>','<input id="w3-node-probe" aria-label="Synthetic node probe" value="initial"></td>');};
 card._render();
 const root=card.shadowRoot, records=()=>Array.from(root.querySelectorAll('.ht-config-records[data-inventory="addons"] > details'));
 const observer=()=>observers.findLast(o=>!o.disconnected&&o.target===root.getElementById('content'));
 const resize=width=>observer().deliver(width);
 return {dom,card,root,records,observer,resize,addon,reads:()=>reads};
}
test('all open records survive repaint/full render; retained cell control keeps listener, value, selection and caret through locale',()=>{
 const f=fixture();try {
  f.resize(390);const [first,second]=f.records();first.open=true;second.open=true;first.querySelector('summary').focus();
  const stale=f.observer();f.card._updateContent();assert.equal(stale.disconnected,true);
  assert.deepEqual(f.records(),[first,second]);assert.equal(first.open,true);assert.equal(second.open,true);
  let actions=0;const input=f.root.getElementById('w3-node-probe');input.addEventListener('input',()=>actions++);
  input.value='unsaved draft';input.focus();input.setSelectionRange(2,7,'backward');
  for(const width of [500,390,900,499.5])f.resize(width);
  const previousContent=f.root.getElementById('content');f.card._lastHtml='';f.card._render();
  assert.notEqual(f.root.getElementById('content'),previousContent);assert.equal(f.root.getElementById('w3-node-probe'),input);
  stale.deliver(900);assert.equal(f.root.querySelector('table[data-config-inventory="addons"]').parentElement.hidden,true);
  for(const language of ['pl','en']){f.card._lang=language;f.card._updateLocale();
   assert.equal(f.root.getElementById('w3-node-probe'),input);assert.equal(f.root.activeElement,input);
   assert.deepEqual([input.value,input.selectionStart,input.selectionEnd,input.selectionDirection],['unsaved draft',2,7,'backward']);
   assert.equal(first.open,true);assert.equal(second.open,true);
  }
  input.dispatchEvent(new f.dom.window.Event('input'));assert.equal(actions,1);
  assert.equal(f.root.querySelectorAll('#w3-node-probe').length,1);assert.equal(f.reads(),0);
 }finally{f.dom.window.close();}
});
test('a new narrow record receives every original cell, removed rows disappear, reordered identities retain disclosure',()=>{
 const f=fixture();try {
  f.resize(390);const second=f.records()[1];second.open=true;second.querySelector('summary').focus();
  const prior=f.card._auditData;
  f.card._auditData=Object.freeze({...prior,addons:Object.freeze([prior.addons[1],f.addon('c')])});
  f.card._updateContent();assert.equal(f.records().length,2);assert.equal(f.records()[0],second);assert.equal(second.open,true);
  const added=f.records()[1];assert.equal(added.querySelector('summary strong').textContent,'Raw c');
  assert.deepEqual(Array.from(added.querySelectorAll('dd'),node=>node.textContent),['Raw c','1','started','✓ On','✗ Off','No']);
  assert.equal(f.root.querySelectorAll('#w3-node-probe').length,1);assert.equal(f.reads(),0);
 }finally{f.dom.window.close();}
});
