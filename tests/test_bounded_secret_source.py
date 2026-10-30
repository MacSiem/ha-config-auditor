"""Source-bound regression tests for the real Config Auditor YAML secret scan.

Only synthetic temporary files. Does not start Home Assistant or read user config.
Run with SCAN_SOURCE_ROOT pointing at frozen/ or an isolated replay checkout.
"""
from __future__ import annotations

import asyncio
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest import mock


# Defaults to this checkout, so `unittest discover` in CI exercises the real source.
ROOT = Path(os.environ.get("SCAN_SOURCE_ROOT") or Path(__file__).resolve().parents[1])
PACKAGE = "custom_components.ha_config_auditor"
COMPONENT = ROOT / "custom_components" / "ha_config_auditor"

ha = ModuleType("homeassistant")
ha.__path__ = []
core = ModuleType("homeassistant.core")
core.HomeAssistant = object
util = ModuleType("homeassistant.util")
util.__path__ = []
dt = ModuleType("homeassistant.util.dt")
dt.utcnow = lambda: None
ha.core = core
ha.util = util
util.dt = dt
sys.modules.update({
    "homeassistant": ha,
    "homeassistant.core": core,
    "homeassistant.util": util,
    "homeassistant.util.dt": dt,
})

components = ModuleType("custom_components")
components.__path__ = [str(ROOT / "custom_components")]
package = ModuleType(PACKAGE)
package.__path__ = [str(COMPONENT)]
sys.modules["custom_components"] = components
sys.modules[PACKAGE] = package


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


const_path = COMPONENT / "const.py"
if not const_path.exists():
    const_path = Path(__file__).resolve().parents[2] / "frozen" / "custom_components" / "ha_config_auditor" / "const.py"
load(f"{PACKAGE}.const", const_path)
audit = load(f"{PACKAGE}.audit", COMPONENT / "audit.py")


class ConfigScanSourceTests(unittest.TestCase):
    def setUp(self):
        scratch = Path(os.environ.get("SCAN_TEST_SCRATCH", str(Path(__file__).resolve().parents[2] / "scratch")))
        scratch.mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="config-audit-synthetic-", dir=scratch)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.cfg = self.root / "config"
        self.cfg.mkdir()

    def test_valid_scan_reports_only_file_line_key_and_no_values(self):
        (self.cfg / "automations.yaml").write_text(
            "api_key: PRIVATE-SYNTHETIC-VALUE\npassword: !secret auth_key\n",
            encoding="utf-8",
        )
        (self.cfg / "secrets.yaml").write_text("password: PRIVATE-SYNTHETIC-VALUE\n")
        got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertTrue(got["complete"])
        self.assertEqual(got["total"], 1)
        self.assertEqual(got["matches"], [
            {"file": "automations.yaml", "line": 1, "key": "api_key"}
        ])
        self.assertNotIn("PRIVATE-SYNTHETIC-VALUE", repr(got))

    def test_invalid_utf8_is_not_a_complete_negative_audit(self):
        # A broken byte in the *key* is silently replaced by the original code.
        # Its result incorrectly claims a complete scan and no matches.
        (self.cfg / "automations.yaml").write_bytes(
            b"api_\xffkey: PRIVATE-SYNTHETIC-VALUE\n"
        )
        got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertFalse(got["complete"])
        self.assertEqual(got["files_scanned"], 0)
        self.assertEqual(got["files_skipped"], 1)
        self.assertEqual(got["total"], 0)
        self.assertNotIn("PRIVATE-SYNTHETIC-VALUE", repr(got))

    def test_invalid_utf8_reaches_actual_finding_as_skipped_not_green(self):
        (self.cfg / "configuration.yaml").write_bytes(b"pass\xffword: SECRET\n")
        class Hass:
            config = SimpleNamespace(config_dir=str(self.cfg))
            async def async_add_executor_job(self, func, *args):
                return func(*args)
        findings = asyncio.run(audit._check_plaintext_secrets(Hass()))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].id, "yaml_plaintext_secrets")
        self.assertEqual(findings[0].status, "skipped")
        self.assertNotIn("SECRET", repr(findings[0].as_dict()))

    def test_symlink_is_skipped_without_following_target(self):
        outside = self.root / "outside.yaml"
        outside.write_text("password: PRIVATE-OUTSIDE-DATA\n", encoding="utf-8")
        (self.cfg / "automations.yaml").symlink_to(outside)
        got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertFalse(got["complete"])
        self.assertEqual(got["files_skipped"], 1)
        self.assertEqual(got["total"], 0)
        self.assertEqual(outside.read_text(), "password: PRIVATE-OUTSIDE-DATA\n")
        self.assertNotIn("PRIVATE-OUTSIDE-DATA", repr(got))

    @unittest.skipIf(os.getenv("SCAN_BASELINE") == "1", "FIFO would block on original unbounded read_text")
    def test_named_pipe_is_skipped_without_hanging(self):
        if not hasattr(os, "mkfifo"):
            self.skipTest("Named pipes unsupported")
        os.mkfifo(self.cfg / "automations.yaml")
        got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertEqual(got["files_scanned"], 0)
        self.assertEqual(got["files_skipped"], 1)
        self.assertFalse(got["complete"])

    def test_oversized_yaml_is_skipped(self):
        path = self.cfg / "automations.yaml"
        path.write_bytes(b"password: " + b"q" * audit.SCAN_MAX_FILE_BYTES)
        got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertFalse(got["complete"])
        self.assertEqual(got["files_skipped"], 1)
        self.assertEqual(got["files_scanned"], 0)

    def test_replaced_path_during_open_is_incomplete(self):
        # Open original inode, then swap its directory entry for a symlink.
        # The descriptor still points at the old file, so a post-read pathname
        # identity check must refuse an apparently complete result.
        candidate = self.cfg / "automations.yaml"
        candidate.write_text("password: SYNTHETIC-PINNED\n")
        outside = self.root / "outside.yaml"
        outside.write_text("password: SYNTHETIC-OTHER\n")
        real_open = os.open
        swap = {"done": False}

        def swap_after_open(name, flags, *args, **kwargs):
            descriptor = real_open(name, flags, *args, **kwargs)
            if Path(name) == candidate:
                candidate.unlink()
                candidate.symlink_to(outside)
                swap["done"] = True
            return descriptor

        with mock.patch.object(audit.os, "open", side_effect=swap_after_open):
            got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertFalse(got["complete"])
        self.assertEqual(got["files_skipped"], 1)
        self.assertEqual(got["total"], 0)
        if os.getenv("SCAN_BASELINE") != "1":
            self.assertTrue(swap["done"])
        self.assertNotIn("SYNTHETIC-", repr(got))



    def test_two_regular_yaml_files_scan_without_losing_walk_directory(self):
        (self.cfg / "a.yaml").write_text("api_key: SYNTHETIC-A\n", encoding="utf-8")
        (self.cfg / "b.yml").write_text("password: SYNTHETIC-B\n", encoding="utf-8")
        got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertEqual(got["files_scanned"], 2)
        self.assertEqual(got["files_skipped"], 0)
        self.assertEqual(got["total"], 2)
        self.assertTrue(got["complete"])
        self.assertEqual([m["file"] for m in got["matches"]], ["a.yaml", "b.yml"])
        self.assertNotIn("SYNTHETIC-", repr(got))

    def test_two_files_one_invalid_utf8_stays_partial(self):
        (self.cfg / "a.yaml").write_text("mode: standby\n", encoding="utf-8")
        (self.cfg / "b.yaml").write_bytes(b"pass\xffword: SYNTHETIC-SECRET\n")
        got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertEqual(got["files_scanned"], 1)
        self.assertEqual(got["files_skipped"], 1)
        self.assertEqual(got["total"], 0)
        self.assertFalse(got["complete"])
        class Hass:
            config = SimpleNamespace(config_dir=str(self.cfg))
            async def async_add_executor_job(self, func, *args):
                return func(*args)
        finding = asyncio.run(audit._check_plaintext_secrets(Hass()))[0]
        self.assertEqual(finding.status, "skipped")
        self.assertNotIn("SYNTHETIC-SECRET", repr(finding.as_dict()))

    def test_multifile_mixed_known_finding_and_symlink_is_not_complete(self):
        (self.cfg / "a.yaml").write_text("api_key: SYNTHETIC-KNOWN\n", encoding="utf-8")
        outside = self.root / "outside.yaml"
        outside.write_text("password: SYNTHETIC-OUTSIDE\n")
        (self.cfg / "b.yaml").symlink_to(outside)
        got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertEqual((got["files_scanned"], got["files_skipped"], got["total"]),
                         (1, 1, 1))
        self.assertFalse(got["complete"])
        self.assertNotIn("SYNTHETIC-", repr(got))

    def test_path_same_inode_changed_after_descriptor_read_stays_partial(self):
        candidate = self.cfg / "a.yaml"
        candidate.write_text("mode: initial\n", encoding="utf-8")
        real_stat = os.stat
        changed = {"done": False}
        def mutate_on_path_stat(target, *args, **kwargs):
            if not changed["done"] and Path(target) == candidate and kwargs.get("follow_symlinks") is False:
                candidate.write_text("api_key: SYNTHETIC-MODIFIED-AFTER-READ\n", encoding="utf-8")
                changed["done"] = True
            return real_stat(target, *args, **kwargs)
        with mock.patch.object(audit.os, "stat", side_effect=mutate_on_path_stat):
            got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertTrue(changed["done"])
        self.assertFalse(got["complete"])
        self.assertEqual((got["files_scanned"], got["files_skipped"], got["total"]),
                         (0, 1, 0))
        self.assertNotIn("SYNTHETIC-", repr(got))



    def test_eligible_directory_symlink_is_incomplete_without_following(self):
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "unread.yaml").write_text("api_key: SYNTHETIC-OUTSIDE\n")
        (self.cfg / "linked").symlink_to(outside, target_is_directory=True)
        got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertEqual((got["files_scanned"], got["files_skipped"], got["total"]), (0, 1, 0))
        self.assertFalse(got["complete"])
        self.assertEqual(got["matches"], [])
        self.assertNotIn("SYNTHETIC-OUTSIDE", repr(got))

    def test_regular_yaml_plus_linked_directory_keeps_partial_finding(self):
        (self.cfg / "normal.yaml").write_text("api_key: SYNTHETIC-KNOWN\n")
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "unread.yaml").write_text("password: SYNTHETIC-OUTSIDE\n")
        (self.cfg / "linked").symlink_to(outside, target_is_directory=True)
        got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertEqual((got["files_scanned"], got["files_skipped"], got["total"]), (1, 1, 1))
        self.assertFalse(got["complete"])
        self.assertEqual(got["matches"], [{"file": "normal.yaml", "line": 1, "key": "api_key"}])
        self.assertNotIn("SYNTHETIC-", repr(got))
        class Hass:
            config = SimpleNamespace(config_dir=str(self.cfg))
            async def async_add_executor_job(self, func, *args):
                return func(*args)
        finding = asyncio.run(audit._check_plaintext_secrets(Hass()))[0]
        self.assertEqual(finding.status, "warning")
        self.assertIn("incomplete", finding.detail.lower())
        self.assertNotIn("SYNTHETIC-", repr(finding.as_dict()))

    def test_regular_nested_yaml_remains_complete(self):
        nested = self.cfg / "included"
        nested.mkdir()
        (nested / "normal.yml").write_text("password: SYNTHETIC-KNOWN\n")
        got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertTrue(got["complete"])
        self.assertEqual((got["files_scanned"], got["files_skipped"], got["total"]), (1, 0, 1))
        self.assertEqual(got["matches"], [{"file": "included/normal.yml", "line": 1, "key": "password"}])

    def test_excluded_directory_link_not_counted_in_bounded_scope(self):
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "unread.yaml").write_text("password: SYNTHETIC-OUTSIDE\n")
        (self.cfg / "www").symlink_to(outside, target_is_directory=True)
        (self.cfg / "visible.yaml").write_text("mode: standby\n")
        got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertTrue(got["complete"])
        self.assertEqual((got["files_scanned"], got["files_skipped"], got["total"]), (1, 0, 0))

    def test_directory_read_failure_is_not_reported_as_complete(self):
        nested = self.cfg / "unreadable"
        nested.mkdir()
        (nested / "data.yaml").write_text("api_key: SYNTHETIC-OUTSIDE\n")
        original_scandir = os.scandir
        def denied(path):
            if Path(path) == nested:
                raise PermissionError("SYNTHETIC-DENIED")
            return original_scandir(path)
        with mock.patch.object(audit.os, "scandir", side_effect=denied):
            got = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertEqual((got["files_scanned"], got["files_skipped"], got["total"]), (0, 1, 0))
        self.assertFalse(got["complete"])
        self.assertNotIn("SYNTHETIC-DENIED", repr(got))


    def test_short_regular_file_read_is_incomplete_without_secret_leak(self):
        filename = self.cfg / "automations.yaml"
        filename.write_text("password: SYNTHETIC-HIDDEN-SECRET\n", encoding="utf-8")
        original_fdopen = audit.os.fdopen

        class ShortRead:
            def __init__(self, handle):
                self._handle = handle
            def __enter__(self):
                self._handle.__enter__()
                return self
            def __exit__(self, *args):
                return self._handle.__exit__(*args)
            def fileno(self):
                return self._handle.fileno()
            def read(self, maximum):
                return self._handle.read(min(maximum, 4))

        class Hass:
            config = SimpleNamespace(config_dir=str(self.cfg))
            async def async_add_executor_job(self, func, *args):
                return func(*args)

        with mock.patch.object(
            audit.os, "fdopen",
            side_effect=lambda fd, mode: ShortRead(original_fdopen(fd, mode)),
        ):
            result = audit._scan_plaintext_secrets(str(self.cfg))
            finding = asyncio.run(audit._check_plaintext_secrets(Hass()))[0]
        self.assertEqual((result["files_scanned"], result["files_skipped"], result["total"]), (0, 1, 0))
        self.assertFalse(result["complete"])
        self.assertEqual(result["matches"], [])
        self.assertEqual(finding.status, "skipped")
        self.assertIn("incomplete", finding.detail.lower())
        self.assertNotIn("SYNTHETIC-HIDDEN-SECRET", repr(result) + repr(finding.as_dict()))

    def test_zero_byte_regular_file_is_complete_not_partial(self):
        (self.cfg / "automations.yaml").write_bytes(b"")
        result = audit._scan_plaintext_secrets(str(self.cfg))
        self.assertEqual((result["files_scanned"], result["files_skipped"], result["total"]), (1, 0, 0))
        self.assertTrue(result["complete"])


if __name__ == "__main__":
    unittest.main()
