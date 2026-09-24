"""Config Auditor: server-verified configuration checks for Home Assistant."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CoreState, Event, HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.typing import ConfigType
import homeassistant.helpers.config_validation as cv

from . import frontend as ca_frontend, websocket_api
from .audit import async_run_audit
from .const import (
    CONF_CREATE_REPAIRS,
    CONF_SHOW_PANEL,
    DEFAULT_CREATE_REPAIRS,
    DEFAULT_SHOW_PANEL,
    DOMAIN,
    REPAIR_INTERVAL_HOURS,
)
from .repairs import async_clear_issues, async_sync_issues

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
DATA_WS = f"{DOMAIN}_ws_registered"


@dataclass(slots=True)
class RuntimeData:
    """Per-entry runtime state."""

    panel_registered: bool = False
    card_registration: str | None = None


type ConfigAuditorConfigEntry = ConfigEntry[RuntimeData]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the integration (config entry only)."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigAuditorConfigEntry) -> bool:
    """Set up Config Auditor from a config entry."""
    runtime = RuntimeData()
    entry.runtime_data = runtime

    if not hass.data.get(DATA_WS):
        websocket_api.async_register(hass)
        hass.data[DATA_WS] = True

    await ca_frontend.async_register_static(hass)
    runtime.card_registration = await ca_frontend.async_register_card(hass)
    if entry.options.get(CONF_SHOW_PANEL, DEFAULT_SHOW_PANEL):
        runtime.panel_registered = await ca_frontend.async_register_panel(hass)

    if entry.options.get(CONF_CREATE_REPAIRS, DEFAULT_CREATE_REPAIRS):

        async def _refresh(_now=None) -> None:
            try:
                async_sync_issues(hass, await async_run_audit(hass))
            except Exception:  # noqa: BLE001 - background refresh must never crash HA
                _LOGGER.exception("Config Auditor background audit failed")

        entry.async_on_unload(
            async_track_time_interval(hass, _refresh, timedelta(hours=REPAIR_INTERVAL_HOURS))
        )
        if hass.state is CoreState.running:
            entry.async_create_background_task(hass, _refresh(), f"{DOMAIN}_audit")
        else:

            @callback
            def _on_started(_event: Event) -> None:
                entry.async_create_background_task(hass, _refresh(), f"{DOMAIN}_audit")

            entry.async_on_unload(
                hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _on_started)
            )
    else:
        async_clear_issues(hass)

    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigAuditorConfigEntry) -> None:
    """Reload so panel and Repairs options take effect."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigAuditorConfigEntry) -> bool:
    """Unload a config entry."""
    runtime: RuntimeData = entry.runtime_data
    if runtime.panel_registered:
        ca_frontend.async_unregister_panel(hass)
        runtime.panel_registered = False
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigAuditorConfigEntry) -> None:
    """Clean up the Lovelace resource and Repairs issues when removed."""
    await ca_frontend.async_unregister_card(hass)
    async_clear_issues(hass)
