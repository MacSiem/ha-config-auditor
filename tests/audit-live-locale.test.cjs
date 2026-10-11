const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
async function fixture(language='en', supervised=true) {
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://qa.invalid/',virtualConsole:new VirtualConsole()});
 dom.window.eval(fs.readFileSync('ha-config-auditor.js','utf8'));
 const card=dom.window.document.createElement('ha-config-auditor'); card.setConfig({title:'My audit'});dom.window.document.body.append(card);
 let reads=0;
 const hass={language,themes:{},states:{},user:{id:'admin',is_admin:true},config:{components:[],version:'2026.9.4'},callWS:async m=>{reads++; if(m.type==='config_entries/get')return [];if(m.endpoint==='/core/info'&&supervised)return {version:'2026.9.4',version_latest:'2026.10.1'};throw Error('Unavailable');}};
 card.hass=hass;
 const loading=card.shadowRoot.getElementById('content').textContent;
 for(let i=0;i<70&&card._loading;i++)await new Promise(r=>setImmediate(r));
 return {dom,card,hass,loading,reads:()=>reads};
}
test('fresh Polish audit localizes tabs, loading, summary and stored update findings',async()=>{
 const f=await fixture('pl-PL');try {
 const root=f.card.shadowRoot;
 assert.deepEqual([...root.querySelectorAll('[role=tab]')].map(x=>x.textContent),['Przegląd','Wyniki','Dodatki i integracje','Sieć','Użytkownicy','Wskazówki']);
 assert.match(f.loading,/Trwa audyt/);assert.match(root.getElementById('content').textContent,/Podsumowanie dobrych praktyk/);
 root.querySelector('[data-tab=critical]').click();
 assert.match(root.getElementById('content').textContent,/Dostępna aktualizacja HA Core/);
 assert.match(root.getElementById('content').textContent,/Bieżąca: 2026.9.4 → Najnowsza: 2026.10.1/);
 assert.match(root.getElementById('content').textContent,/Ustawienia → System → Aktualizacje/);
 assert.doesNotMatch(root.getElementById('content').textContent,/Server-side|Failed|Warning|not checked/);
 }finally{f.dom.window.close();}
});
test('locale switches before throttle retain findings data, counts, content node and focused tab without reads',async()=>{
 const f=await fixture();try{
 const root=f.card.shadowRoot;const data=f.card._auditData;const reads=f.reads();const tab=root.querySelector('[data-tab=critical]');tab.click();tab.focus();const node=root.getElementById('content');
 for(const lang of ['pl','en','pl-PL']){f.card.hass={...f.hass,language:lang};assert.equal(f.card._auditData,data);assert.equal(f.reads(),reads);assert.equal(f.card._activeTab,'critical');assert.equal(root.activeElement,tab);assert.equal(root.getElementById('content'),node);assert.match(node.textContent,lang==='en'?/HA Core update available/:/Dostępna aktualizacja HA Core/);}
 root.querySelector('[data-tab=tips]').click();assert.match(node.textContent,/Uwierzytelnianie/);f.card.hass={...f.hass,language:'en'};assert.match(node.textContent,/Authentication/);assert.equal(f.reads(),reads);
 }finally{f.dom.window.close();}
});
test('no Supervisor, empty findings and unavailable inventories follow live locale',async()=>{
 const f=await fixture('pl',false);try{
 const root=f.card.shadowRoot;root.querySelector('[data-tab=critical]').click();assert.match(root.getElementById('content').textContent,/Supervisor API niedostępne/);
 root.querySelector('[data-tab=addons]').click();assert.match(root.getElementById('content').textContent,/Lista dodatków jest niedostępna/);
 root.querySelector('[data-tab=users]').click();assert.match(root.getElementById('content').textContent,/Konta użytkowników są niedostępne/);
 f.card._auditData.findings={critical:[],warning:[],info:[],pass:[]};root.querySelector('[data-tab=critical]').click();assert.match(root.getElementById('content').textContent,/Brak wyników/);
 f.card.hass={...f.hass,language:'en'};assert.match(root.getElementById('content').textContent,/No findings/);
 }finally{f.dom.window.close();}
});
test('distributed bundles stay identical',()=>assert.equal(fs.readFileSync('ha-config-auditor.js','utf8'),fs.readFileSync('custom_components/ha_config_auditor/www/ha-config-auditor.js','utf8')));
