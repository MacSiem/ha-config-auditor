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
  const version = value => typeof value === 'string' && /^\d+(?:\.[\da-z]+)+(?:[-+][\w.-]+)?$/i.test(value) && value.length < 64 ? value : null;
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const contextCopy = context => context && ['owner','instance','scope'].every(k => opaque(context[k])) ? Object.fromEntries(['owner','instance','scope'].map(k => [k,context[k]])) : null;
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
    if (before.context.instance!==after.context.instance) return incompatible('instance_or_session_unconfirmed');
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
    if(comparison)output.comparison={compatible:comparison.compatible===true,reason:['select_two_saved_reports','schema_changed','method_changed','scope_changed','identity_unconfirmed','user_changed','instance_or_session_unconfirmed','integration_version_changed','baseline_is_newer'].includes(comparison.reason)?comparison.reason:null,checks:comparison.compatible===true?comparison.checks.filter(c=>identities.has(c.id)&&Object.hasOwn(L.changes,c.change)).map(c=>({id:c.id,change:c.change,label:L.changes[c.change]})):[]};
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
// Node tests use the canonical factory; this line is excluded from runtime copies.
if (typeof module !== 'undefined' && module.exports) module.exports = { createAuditReports };
