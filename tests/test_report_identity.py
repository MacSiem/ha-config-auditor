"""Readonly persisted identity fixtures; no Home Assistant files or credentials."""
import asyncio
import importlib.util
import json
from pathlib import Path
import tempfile
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
        other=file.with_name('fixture-target');file.rename(other);file.symlink_to(other)
        self.assertFalse((await identity.async_report_source(hass, USER))['confirmed'])
        self.assertTrue(file.is_symlink());self.assertEqual(' '*5000,other.read_text())

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
