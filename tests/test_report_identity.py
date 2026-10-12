"""Readonly persisted identity fixtures; no Home Assistant files or credentials."""
import asyncio
import importlib.util
import json
from pathlib import Path
import tempfile
import sys
from types import ModuleType
from unittest.mock import patch
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('config_report_identity_fixture',
    ROOT / 'custom_components/ha_config_auditor/report_identity.py')
identity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(identity)
UUID = '1' * 32
USER = '2' * 32


class ReportIdentityTests(unittest.IsolatedAsyncioTestCase):
    def fixture(self, raw):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        directory = Path(temp.name)
        stored = directory / '.storage' / 'core.uuid'
        stored.parent.mkdir()
        if raw is not None: stored.write_text(raw)
        calls=[]
        def path(*parts): return str(directory.joinpath(*parts))
        async def executor(fn,*args): calls.append(args); return fn(*args)
        return SimpleNamespace(config=SimpleNamespace(path=path),async_add_executor_job=executor), stored, calls

    async def test_existing_uuid_is_stable_across_sessions_and_never_returned_or_changed(self):
        raw=json.dumps({'version':1,'minor_version':1,'key':'core.uuid','data':{'uuid':UUID}})
        hass,file,calls=self.fixture(raw)
        before=file.read_bytes(),file.stat().st_mtime_ns
        one=await identity.async_report_source(hass, USER)
        two=await identity.async_report_source(hass, USER)
        self.assertEqual(one,two);self.assertTrue(one['confirmed'])
        self.assertEqual('core_uuid_readonly',one['source']);self.assertEqual(1,one['schema'])
        for key in ['instance','owner','scope']:self.assertRegex(one[key],r'^c-[a-f0-9]{32}$')
        self.assertNotIn(UUID,json.dumps(one));self.assertNotIn(USER,json.dumps(one))
        self.assertEqual(before,(file.read_bytes(),file.stat().st_mtime_ns));self.assertEqual(2,len(calls))

    async def test_user_and_instance_changes_have_different_references(self):
        hass,file,_=self.fixture(json.dumps({'version':1,'key':'core.uuid','data':{'uuid':UUID}}))
        a=await identity.async_report_source(hass, USER)
        b=await identity.async_report_source(hass, '3'*32)
        self.assertEqual(a['instance'],b['instance']);self.assertNotEqual(a['owner'],b['owner'])
        file.write_text(json.dumps({'version':1,'key':'core.uuid','data':{'uuid':'4'*32}}))
        c=await identity.async_report_source(hass, USER)
        self.assertNotEqual(a['instance'],c['instance']);self.assertEqual(a['scope'],c['scope'])

    async def test_missing_and_corrupt_sources_are_unknown_without_create_quarantine_or_log_payload(self):
        raws=[None,'CANARY malformed secret',json.dumps({'version':2,'key':'core.uuid','data':{'uuid':UUID}}),
              json.dumps({'version':True,'key':'core.uuid','data':{'uuid':UUID}}),
              json.dumps({'version':1,'key':'wrong','data':{'uuid':UUID}}),
              json.dumps({'version':1,'key':'core.uuid','data':{'uuid':'CANARY'}}),
              '{"version":1,"version":2,"key":"core.uuid","data":{"uuid":"'+UUID+'"}}']
        for raw in raws:
            with self.subTest(raw=raw):
                hass,file,_=self.fixture(raw);paths=list(file.parent.iterdir())
                result=await identity.async_report_source(hass, USER)
                self.assertFalse(result['confirmed']);self.assertIsNone(result['instance'])
                self.assertNotIn('CANARY',json.dumps(result));self.assertEqual(paths,list(file.parent.iterdir()))
                if raw is not None:self.assertEqual(raw,file.read_text())

    async def test_source_is_bounded_and_regular_only_without_following_symlinks(self):
        hass,file,_=self.fixture(' '*5000)
        self.assertFalse((await identity.async_report_source(hass, USER))['confirmed'])
        # Quarantine our own synthetic file; never delete or mutate a real HA store.
        other=file.with_name('fixture-target');file.rename(other);other.write_text(json.dumps({'version':1,'key':'core.uuid','data':{'uuid':UUID}}));file.symlink_to(other)
        self.assertFalse((await identity.async_report_source(hass, USER))['confirmed'])
        self.assertTrue(file.is_symlink());self.assertEqual(UUID,json.loads(other.read_text())['data']['uuid'])

    async def test_timeout_does_not_replay_or_expose_late_identity(self):
        hass,file,_=self.fixture(json.dumps({'version':1,'key':'core.uuid','data':{'uuid':UUID}}))
        calls=[]
        async def slow(fn,*args): calls.append(args); await asyncio.sleep(1);return fn(*args)
        hass.async_add_executor_job=slow
        result=await identity.async_report_source(hass,USER,timeout=.01)
        self.assertFalse(result['confirmed']);self.assertEqual(1,len(calls))
        self.assertTrue(file.exists())

    async def test_invalid_authenticated_identity_does_not_guess_owner_or_confirm_source(self):
        hass,_,_=self.fixture(json.dumps({'version':1,'key':'core.uuid','data':{'uuid':UUID}}))
        for value in [None,'',{'name':'CANARY'},'X'*300]:
            result=await identity.async_report_source(hass,value)
            self.assertFalse(result['confirmed']);self.assertIsNone(result['owner'])
            self.assertNotIn('CANARY',json.dumps(result))


class ReportSourceWebSocketTests(unittest.IsolatedAsyncioTestCase):
    def fixture(self):
        package_name='config_identity_ws_fixture'
        package=ModuleType(package_name);package.__path__=[str(ROOT/'custom_components/ha_config_auditor')]
        core=ModuleType('homeassistant.core');core.HomeAssistant=object;core.callback=lambda fn:fn
        entries=ModuleType('homeassistant.config_entries');loaded=object();entries.ConfigEntryState=SimpleNamespace(LOADED=loaded)
        api=ModuleType('homeassistant.components.websocket_api');api.ActiveConnection=object
        api.websocket_command=lambda schema:lambda fn:fn;api.async_response=lambda fn:fn
        def admin(fn):
            async def guarded(hass,conn,msg):
                if not conn.user.is_admin:conn.send_error(msg['id'],'unauthorized','Admin required');return
                await fn(hass,conn,msg)
            return guarded
        api.require_admin=admin
        components=ModuleType('homeassistant.components');components.websocket_api=api
        vol=ModuleType('voluptuous');vol.Required=lambda key:key
        audit=ModuleType(package_name+'.audit');self.original={'findings':[],'version':'6.0.2'};self.audit_calls=0
        async def run(hass):self.audit_calls+=1;return self.original
        audit.async_run_audit=run
        modules={package_name:package,core.__name__:core,entries.__name__:entries,components.__name__:components,api.__name__:api,'voluptuous':vol,audit.__name__:audit}
        stubs=patch.dict(sys.modules,modules);stubs.start();self.addCleanup(stubs.stop)
        specification=importlib.util.spec_from_file_location(package_name+'.websocket_api',ROOT/'custom_components/ha_config_auditor/websocket_api.py')
        ws=importlib.util.module_from_spec(specification);specification.loader.exec_module(ws)
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);directory=Path(temp.name);stored=directory/'.storage/core.uuid';stored.parent.mkdir();stored.write_text(json.dumps({'version':1,'key':'core.uuid','data':{'uuid':UUID}}))
        self.results,self.errors,self.file_calls=[],[],[]
        conn=SimpleNamespace(user=SimpleNamespace(id=USER,is_admin=True),send_result=lambda *a:self.results.append(a),send_error=lambda *a:self.errors.append(a))
        row=SimpleNamespace(state=loaded)
        async def executor(fn,*args):
            self.file_calls.append(args)
            if getattr(self,'lose_role',False):conn.user.is_admin=False
            if getattr(self,'change_user',False):conn.user.id='3'*32
            if getattr(self,'unload',False):row.state=object()
            return fn(*args)
        hass=SimpleNamespace(config=SimpleNamespace(path=lambda *parts:str(directory.joinpath(*parts))),async_add_executor_job=executor,config_entries=SimpleNamespace(async_entries=lambda domain:[row]))
        return ws,hass,conn,stored

    async def test_actual_websocket_adds_only_opaque_source_without_mutating_reused_report(self):
        ws,hass,conn,file=self.fixture();before=file.read_bytes()
        await ws.ws_audit(hass,conn,{'id':1})
        source=self.results[0][1]['report_source'];self.assertTrue(source['confirmed'])
        self.assertNotIn(UUID,json.dumps(source));self.assertNotIn(USER,json.dumps(source))
        self.assertNotIn('report_source',self.original);self.assertEqual(before,file.read_bytes());self.assertEqual([],self.errors)

    async def test_actual_websocket_denies_household_before_audit_and_identity_read(self):
        ws,hass,conn,_=self.fixture();conn.user.is_admin=False
        await ws.ws_audit(hass,conn,{'id':1});self.assertEqual([],self.results)
        self.assertEqual(0,self.audit_calls);self.assertEqual([],self.file_calls);self.assertEqual('unauthorized',self.errors[0][1])

    async def test_role_user_and_loaded_state_are_rechecked_after_identity_await(self):
        for field,code in [('lose_role','unauthorized'),('change_user','unauthorized'),('unload','unavailable')]:
            with self.subTest(field=field):
                setattr(self,field,True)
                ws,hass,conn,file=self.fixture();before=file.read_bytes()
                await ws.ws_audit(hass,conn,{'id':1})
                self.assertEqual([],self.results);self.assertEqual(code,self.errors[0][1]);self.assertEqual(before,file.read_bytes())
                setattr(self,field,False)
