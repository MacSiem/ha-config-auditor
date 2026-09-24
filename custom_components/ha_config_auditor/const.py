"""Constants for the Config Auditor integration."""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "ha_config_auditor"
NAME: Final = "Config Auditor"
VERSION: Final = "6.0.0"

CARD_FILENAME: Final = "ha-config-auditor.js"
CARD_ELEMENT: Final = "ha-config-auditor"
STATIC_URL_BASE: Final = f"/{DOMAIN}"
CARD_URL: Final = f"{STATIC_URL_BASE}/{CARD_FILENAME}"

PANEL_URL_PATH: Final = "config-auditor"
PANEL_TITLE: Final = "Config Auditor"
PANEL_ICON: Final = "mdi:shield-check-outline"

CONF_SHOW_PANEL: Final = "show_panel"
CONF_CREATE_REPAIRS: Final = "create_repairs"
DEFAULT_SHOW_PANEL: Final = True
DEFAULT_CREATE_REPAIRS: Final = False

REPAIR_INTERVAL_HOURS: Final = 12
REPAIR_ISSUE_PREFIX: Final = "finding_"

# Plain-text secret scan limits (keeps the executor job bounded on any install).
SCAN_MAX_FILES: Final = 400
SCAN_MAX_FILE_BYTES: Final = 1_000_000
SCAN_MAX_DEPTH: Final = 4
SCAN_MAX_REPORTED: Final = 25
