"""Config Auditor running inside a real Home Assistant core."""

from __future__ import annotations

from ipaddress import ip_network
from pathlib import Path
from types import SimpleNamespace

import pytest

from homeassistant.components import frontend
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import issue_registry as ir
from homeassistant.setup import async_setup_component

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.ha_config_auditor import audit
from custom_components.ha_config_auditor.const import (
    CARD_URL,
    CONF_CREATE_REPAIRS,
    CONF_SHOW_PANEL,
    DOMAIN,
    PANEL_URL_PATH,
    VERSION,
)


async def _setup(hass: HomeAssistant, options: dict | None = None) -> MockConfigEntry:
    assert await async_setup_component(hass, "http", {})
    assert await async_setup_component(hass, "lovelace", {})
    entry = MockConfigEntry(domain=DOMAIN, data={}, options=options or {}, unique_id=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _by_id(report: dict) -> dict[str, dict]:
    return {finding["id"]: finding for finding in report["findings"]}


async def test_user_flow_is_single_instance(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Config Auditor"
    again = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert again["type"] is FlowResultType.ABORT


async def test_setup_registers_card_resource_and_admin_panel(hass: HomeAssistant) -> None:
    await _setup(hass)
    resources = hass.data["lovelace"].resources
    urls = [item["url"] for item in resources.async_items()]
    assert urls == [f"{CARD_URL}?v={VERSION}"]
    panel = hass.data[frontend.DATA_PANELS][PANEL_URL_PATH]
    assert panel.require_admin is True
    assert panel.config["_panel_custom"]["name"] == "ha-config-auditor"


async def test_existing_hacs_resource_is_not_duplicated(hass: HomeAssistant) -> None:
    assert await async_setup_component(hass, "lovelace", {})
    resources = hass.data["lovelace"].resources
    await resources.async_load()
    resources.loaded = True
    await resources.async_create_item(
        {"res_type": "module", "url": "/hacsfiles/ha-config-auditor/ha-config-auditor.js?hacstag=1"}
    )
    await _setup(hass)
    urls = [item["url"] for item in resources.async_items()]
    assert urls == ["/hacsfiles/ha-config-auditor/ha-config-auditor.js?hacstag=1"]


async def test_upgrade_updates_versioned_resource_url(hass: HomeAssistant) -> None:
    assert await async_setup_component(hass, "lovelace", {})
    resources = hass.data["lovelace"].resources
    await resources.async_load()
    resources.loaded = True
    await resources.async_create_item({"res_type": "module", "url": f"{CARD_URL}?v=5.9.9"})
    await _setup(hass)
    assert [item["url"] for item in resources.async_items()] == [f"{CARD_URL}?v={VERSION}"]


async def test_taken_panel_path_is_left_alone(hass: HomeAssistant) -> None:
    assert await async_setup_component(hass, "frontend", {})
    frontend.async_register_built_in_panel(
        hass, "iframe", sidebar_title="Other", sidebar_icon="mdi:web", frontend_url_path=PANEL_URL_PATH, config={"url": "/x"}
    )
    entry = await _setup(hass)
    assert hass.data[frontend.DATA_PANELS][PANEL_URL_PATH].component_name == "iframe"
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert PANEL_URL_PATH in hass.data[frontend.DATA_PANELS]


async def test_panel_option_off_and_unload_removes_panel(hass: HomeAssistant) -> None:
    entry = await _setup(hass, {CONF_SHOW_PANEL: False})
    assert PANEL_URL_PATH not in hass.data[frontend.DATA_PANELS]
    hass.config_entries.async_update_entry(entry, options={CONF_SHOW_PANEL: True})
    await hass.async_block_till_done()
    assert PANEL_URL_PATH in hass.data[frontend.DATA_PANELS]
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert PANEL_URL_PATH not in hass.data[frontend.DATA_PANELS]


async def test_remove_entry_removes_own_resource(hass: HomeAssistant) -> None:
    entry = await _setup(hass)
    assert await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()
    assert list(hass.data["lovelace"].resources.async_items()) == []


async def test_ws_audit_is_admin_only(hass: HomeAssistant, hass_ws_client, hass_read_only_access_token) -> None:
    await _setup(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json({"id": 1, "type": f"{DOMAIN}/audit"})
    msg = await client.receive_json()
    assert msg["success"] is False
    assert msg["error"]["code"] == "unauthorized"


async def test_ws_audit_reports_real_state(hass: HomeAssistant, hass_ws_client, hass_admin_user) -> None:
    await _setup(hass)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": f"{DOMAIN}/audit"})
    msg = await client.receive_json()
    assert msg["success"] is True
    report = msg["result"]
    assert report["version"] == VERSION
    found = _by_id(report)
    assert set(found) >= {
        "auth_providers",
        "auth_admin_mfa",
        "http_transport",
        "http_trusted_proxies",
        "http_ip_ban",
        "yaml_plaintext_secrets",
    }
    for finding in report["findings"]:
        assert finding["status"] in {"pass", "warning", "fail", "info", "skipped"}
    # The test harness uses the homeassistant provider only and an admin without MFA.
    assert found["auth_providers"]["status"] == "pass"
    assert found["auth_admin_mfa"]["status"] == "warning"


async def test_trusted_proxies_classification(hass: HomeAssistant) -> None:
    hass.http = SimpleNamespace(trusted_proxies=[ip_network("0.0.0.0/0")], app={})
    assert (await audit._check_trusted_proxies(hass))[0].status == "fail"
    hass.http = SimpleNamespace(trusted_proxies=[ip_network("8.0.0.0/8")], app={})
    assert (await audit._check_trusted_proxies(hass))[0].status == "warning"
    hass.http = SimpleNamespace(trusted_proxies=[ip_network("172.30.33.0/24")], app={})
    assert (await audit._check_trusted_proxies(hass))[0].status == "pass"


async def test_transport_classification(hass: HomeAssistant) -> None:
    hass.config.api = SimpleNamespace(use_ssl=False)
    hass.config.external_url = "http://my-home.example.com:8123"
    assert (await audit._check_transport(hass))[0].status == "fail"
    hass.config.external_url = "https://my-home.example.com"
    assert (await audit._check_transport(hass))[0].status == "pass"
    hass.config.external_url = "http://192.168.1.10:8123"
    assert (await audit._check_transport(hass))[0].status == "info"


async def test_plaintext_secret_scan_never_returns_values(hass: HomeAssistant, tmp_path: Path) -> None:
    (tmp_path / "configuration.yaml").write_text(
        "homeassistant:\n"
        "  name: Home\n"
        "notify:\n"
        "  - platform: smtp\n"
        "    password: hunter2-CANARY\n"
        "    username: me\n"
        "sensor:\n"
        "  - platform: rest\n"
        "    api_key: !secret rest_key\n"
        "    token: \"{{ states('input_text.t') }}\"\n"
        "# password: commented-CANARY\n",
        encoding="utf-8",
    )
    (tmp_path / "secrets.yaml").write_text("rest_key: secret-CANARY\n", encoding="utf-8")
    (tmp_path / "packages").mkdir()
    (tmp_path / "packages" / "mqtt.yaml").write_text("mqtt_password: plain-CANARY\n", encoding="utf-8")
    (tmp_path / ".storage").mkdir()
    (tmp_path / ".storage" / "x.yaml").write_text("password: hidden-CANARY\n", encoding="utf-8")
    result = audit._scan_plaintext_secrets(str(tmp_path))
    assert result["total"] == 2
    assert {(m["file"], m["key"]) for m in result["matches"]} == {
        ("configuration.yaml", "password"),
        ("packages/mqtt.yaml", "mqtt_password"),
    }
    assert "CANARY" not in repr(result)


async def test_repairs_created_and_cleared(hass: HomeAssistant, monkeypatch) -> None:
    report = {
        "findings": [
            {"id": "http_transport", "status": "fail", "title": "External URL uses plain HTTP", "detail": "d", "fix": "f"},
            {"id": "auth_admin_mfa", "status": "warning", "title": "MFA", "detail": "d", "fix": None},
            {"id": "http_ip_ban", "status": "pass", "title": "ok", "detail": "d", "fix": None},
        ]
    }

    async def fake_audit(_hass):
        return report

    monkeypatch.setattr("custom_components.ha_config_auditor.async_run_audit", fake_audit)
    entry = await _setup(hass, {CONF_CREATE_REPAIRS: True})
    await hass.async_block_till_done()
    registry = ir.async_get(hass)
    issues = {issue_id for (domain, issue_id) in registry.issues if domain == DOMAIN}
    assert issues == {"finding_http_transport", "finding_auth_admin_mfa"}
    assert registry.async_get_issue(DOMAIN, "finding_http_transport").severity == ir.IssueSeverity.ERROR

    hass.config_entries.async_update_entry(entry, options={CONF_CREATE_REPAIRS: False})
    await hass.async_block_till_done()
    assert not {issue_id for (domain, issue_id) in registry.issues if domain == DOMAIN}


async def test_broken_check_is_reported_as_skipped(hass: HomeAssistant, monkeypatch) -> None:
    async def boom(_hass):
        raise RuntimeError("no access")

    monkeypatch.setattr(audit, "CHECKS", (("auth_providers", boom),))
    report = await audit.async_run_audit(hass)
    assert report["findings"] == [
        {
            "id": "auth_providers",
            "status": "skipped",
            "title": "Check could not run",
            "detail": "RuntimeError: no access",
            "fix": None,
            "category": "security",
            "evidence": {},
        }
    ]
