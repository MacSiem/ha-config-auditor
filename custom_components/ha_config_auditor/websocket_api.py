"""WebSocket API for Config Auditor."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
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
    connection.send_result(msg["id"], await async_run_audit(hass))
