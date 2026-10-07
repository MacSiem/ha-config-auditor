"""WebSocket API for Config Auditor."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback

from .audit import async_run_audit
from .const import DOMAIN


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register the WebSocket commands."""
    websocket_api.async_register_command(hass, ws_audit)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/audit"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_audit(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Run the server-side checks and return the findings."""
    def is_loaded() -> bool:
        return any(entry.state is ConfigEntryState.LOADED for entry in hass.config_entries.async_entries(DOMAIN))

    if not is_loaded():
        connection.send_error(msg["id"], "unavailable", "Config Auditor integration is not loaded")
        return
    report = await async_run_audit(hass)
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Administrator permissions are required")
        return
    if not is_loaded():
        connection.send_error(msg["id"], "unavailable", "Config Auditor integration was unloaded")
        return
    connection.send_result(msg["id"], report)
