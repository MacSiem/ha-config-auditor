const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
async function fixture(language='en', supervised=true, server=null) {
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://qa.invalid/',virtualConsole:new VirtualConsole()});
 dom.window.eval(fs.readFileSync('ha-config-auditor.js','utf8'));
 const card=dom.window.document.createElement('ha-config-auditor'); card.setConfig({title:'My audit'});dom.window.document.body.append(card);
 let reads=0;
 const hass={language,themes:{},states:{},user:{id:'admin',is_admin:true},config:{components:[],version:'2026.9.4'},callWS:async m=>{reads++; if(m.type==='config_entries/get')return [];if(m.type==='ha_config_auditor/audit'&&server)return server;if(m.endpoint==='/core/info'&&supervised)return {version:'2026.9.4',version_latest:'2026.10.1'};throw Error('Unavailable');}};
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

test('server results translate complete status copy and retain escaped raw evidence',async()=>{
 const server={version:'6.0.2',findings:[
 {id:'http_ip_ban',status:'pass',title:'Failed logins lead to an IP ban',detail:'An address is banned after 5 failed login attempt(s). Banned addresses: 2.'},
 {id:'http_trusted_proxies',status:'skipped',title:'Trusted proxies could not be read',detail:'The HTTP server is not available yet.'},
 {id:'auth_admin_mfa',status:'warning',title:'2 administrator(s) without two-factor authentication',detail:'Administrators without MFA: Alice <admin>, Bob.',fix:'Each administrator can enable two-factor authentication in their profile (Security → Multi-factor authentication modules).'},
 {id:'yaml_plaintext_secrets',status:'info',title:'No match in the heuristic YAML secret scan',detail:'Scanned 12 YAML file(s) in the bounded configuration scope; no matching key/value line found. This does not prove all secrets use !secret.'}
 ]};
 const f=await fixture('en',true,server);try{
 const root=f.card.shadowRoot;root.querySelector('[data-tab=critical]').click();const data=f.card._auditData;const reads=f.reads();f.card.hass={...f.hass,language:'pl'};
 const content=root.getElementById('content');assert.match(content.textContent,/Nie udało się odczytać zaufanych proxy \(nie sprawdzono\)/);assert.match(content.textContent,/blokowany po 5/);assert.match(content.textContent,/Zablokowane adresy: 2/);assert.match(content.textContent,/Administratorzy bez MFA: Alice <admin>, Bob/);assert.match(content.textContent,/Zweryfikowano na serwerze/);assert.match(content.textContent,/Przeskanowano 12 plików/);assert.equal(content.querySelector('admin'),null);assert.equal(f.reads(),reads);assert.equal(f.card._auditData,data);
 f.card.hass={...f.hass,language:'en'};assert.match(content.textContent,/Trusted proxies could not be read \(not checked\)/);assert.match(content.textContent,/An address is banned after 5/);
 }finally{f.dom.window.close();}
});

test('PL/EN switches preserve raw network, host, version and inventory values matching UI labels', async () => {
 const f=await fixture('en');try {
 const data=f.card._auditData;
 data.hostInfo={hostname:'User',operating_system:'Tips',supervisor:'Warning'};
 data.networkInterfaces=[{interface:'Tips',type:'Warning',enabled:true,connected:true,mac:'User',ipv4:{address:['Network'],gateway:'Tips',method:'Warning',nameservers:['User']},wifi:{ssid:'Network',signal:42}}];
 data.usersAvailable=true;data.users=[{name:'Warning',is_active:true}];
 data.addonsAvailable=true;data.addons=[{name:'Network',version:'User',state:'started',protected:true,auto_update:false,host_network:false,ports:{8123:{host_port:8123}}}];
 data.integrationsAvailable=true;data.integrations=[{title:'Tips',domain:'Warning',source:'User',state:'loaded'}];
 const hass={...f.hass,config:{...f.hass.config,location_name:'Network',version:'User',time_zone:'Tips'}};
 const root=f.card.shadowRoot;const reads=f.reads();
 for(const language of ['pl','en','pl']) {
  f.card.hass={...hass,language};root.querySelector('[data-tab=network]').click();
  const content=root.getElementById('content');
  const valueFor=label=>[...content.querySelectorAll('span')].find(node=>node.textContent===label)?.nextElementSibling?.textContent;
  const polish=language==='pl';
  for(const [en,pl,raw] of [['Location name','Nazwa lokalizacji','Network'],['HA Version','Wersja HA','User'],['Hostname','Nazwa hosta','User'],['OS','System operacyjny','Tips'],['Supervisor','Supervisor','Warning'],['Time zone','Strefa czasowa','Tips'],['IP','IP','Network'],['Gateway','Brama','Tips'],['DNS','DNS','User'],['MAC','MAC','User'],['Method','Metoda','Warning'],['SSID','SSID','Network']]) {
   assert.equal(valueFor(polish?pl:en),raw,`${language}: ${en} retains raw data`);
  }
  assert.ok([...content.querySelectorAll('.finding-title')].some(node=>node.textContent==='Tips (Warning)'));
  root.querySelector('[data-tab=addons]').click();
  const cells=[...content.querySelectorAll('td')].map(node=>node.textContent);
  for(const raw of ['Network','User','Tips','Warning']) assert.ok(cells.includes(raw),`${language}: inventory retains ${raw}`);
  root.querySelector('[data-tab=users]').click();assert.equal(content.querySelector('td').textContent,'Warning');
  assert.equal(f.card._auditData,data);assert.equal(f.reads(),reads);
 }
 }finally{f.dom.window.close();}
});

test('intro names match localized tabs and Network counts translate without changing entry identifiers', async () => {
 const f=await fixture('pl');try {
 const root=f.card.shadowRoot;const data=f.card._auditData;const reads=f.reads();
 data.integrationsAvailable=true;data.integrations=[{title:'Entry one',domain:'fixture_one',source:'user',state:'setup_retry'},{title:'Entry two',domain:'fixture_two',source:'import',state:'migration_error'}];
 for(const language of ['pl','en','pl-PL']) {
  f.card.hass={...f.hass,language};const polish=language.startsWith('pl');
  const steps=[...root.querySelectorAll('.intro-steps li')].map(node=>node.textContent);
  for(const [index,tab] of [[1,'critical'],[2,'tips']]) assert.ok(steps[index].includes(root.querySelector(`[data-tab=${tab}]`).textContent), `${language}: guidance refers to the visible tab label`);
  if(polish) for(const step of steps) assert.doesNotMatch(step,/Findings|Tips/);
  root.querySelector('[data-tab=network]').click();const content=root.getElementById('content');
  const label=[...content.querySelectorAll('span')].find(node=>node.textContent===(polish?'Integracje':'Integrations'));
  assert.equal(label.nextElementSibling.textContent,polish?'Wpisy: 2':'2 entries');
  root.querySelector('[data-tab=addons]').click();const cells=[...content.querySelectorAll('td')].map(node=>node.textContent);
  for(const raw of ['user','import']) assert.ok(cells.includes(raw));
  for(const raw of ['setup_retry','migration_error']) assert.ok(cells.some(value=>value.includes(raw)));
  assert.equal(f.card._auditData,data);assert.equal(f.reads(),reads);
 }
 }finally{f.dom.window.close();}
});
