"""Optional Repairs issues for failed and warning findings."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir

from .audit import STATUS_FAIL, STATUS_WARNING
from .const import DOMAIN, REPAIR_ISSUE_PREFIX


def _issue_ids(hass: HomeAssistant) -> set[str]:
    registry = ir.async_get(hass)
    return {
        issue_id
        for (domain, issue_id) in registry.issues
        if domain == DOMAIN and issue_id.startswith(REPAIR_ISSUE_PREFIX)
    }


def async_sync_issues(hass: HomeAssistant, report: dict[str, Any]) -> int:
    """Mirror fail/warning findings as Repairs issues; clear resolved ones."""
    wanted: set[str] = set()
    for finding in report.get("findings", []):
        if finding["status"] not in (STATUS_FAIL, STATUS_WARNING):
            continue
        issue_id = f"{REPAIR_ISSUE_PREFIX}{finding['id']}"
        wanted.add(issue_id)
        ir.async_create_issue(
            hass,
            DOMAIN,
            issue_id,
            is_fixable=False,
            is_persistent=False,
            severity=ir.IssueSeverity.ERROR if finding["status"] == STATUS_FAIL else ir.IssueSeverity.WARNING,
            translation_key="finding",
            translation_placeholders={
                "title": finding["title"],
                "detail": finding["detail"],
                "fix": finding.get("fix") or "-",
            },
        )
    for issue_id in _issue_ids(hass) - wanted:
        ir.async_delete_issue(hass, DOMAIN, issue_id)
    return len(wanted)


def async_clear_issues(hass: HomeAssistant) -> None:
    """Remove every issue this integration created."""
    for issue_id in _issue_ids(hass):
        ir.async_delete_issue(hass, DOMAIN, issue_id)
