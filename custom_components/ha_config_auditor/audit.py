"""Server-side configuration checks for Config Auditor.

Every check reads real Home Assistant state (auth providers, users, the running
HTTP server, configuration files) and returns an explicit status. A check that
cannot run returns ``skipped`` with the reason instead of a silent pass.
Secret values are never read into a result: the YAML scan reports file, line
and key only.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
import ipaddress
import logging
import os
from pathlib import Path
import re
from typing import Any
from urllib.parse import urlparse

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .const import (
    SCAN_MAX_DEPTH,
    SCAN_MAX_FILE_BYTES,
    SCAN_MAX_FILES,
    SCAN_MAX_REPORTED,
    VERSION,
)

_LOGGER = logging.getLogger(__name__)

STATUS_PASS = "pass"
STATUS_WARNING = "warning"
STATUS_FAIL = "fail"
STATUS_INFO = "info"
STATUS_SKIPPED = "skipped"

_SKIP_DIRS = frozenset(
    {
        "custom_components",
        "deps",
        "www",
        "tts",
        "backups",
        "node_modules",
        "blueprints",
        "__pycache__",
    }
)
_SECRET_KEY_RE = re.compile(
    r"^\s*(?:-\s+)?(?P<key>[A-Za-z0-9_]*?(?:password|passwd|api_key|apikey|token|"
    r"client_secret|secret|access_key|private_key|auth_key))\s*:\s*(?P<value>.*?)\s*$",
    re.IGNORECASE,
)
_SAFE_VALUE_PREFIXES = ("!secret", "!env_var", "!include", "{{", "{%", "\"{{", "'{{", "#")
_EMPTY_VALUES = frozenset({"", '""', "''", "null", "~", "[]", "{}", "|", ">", "|-", ">-"})


@dataclass(slots=True)
class Finding:
    """One audit result."""

    id: str
    status: str
    title: str
    detail: str
    fix: str | None = None
    category: str = "security"
    evidence: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        """Return a JSON-serialisable dict."""
        return {
            "id": self.id,
            "status": self.status,
            "title": self.title,
            "detail": self.detail,
            "fix": self.fix,
            "category": self.category,
            "evidence": self.evidence,
        }


def _is_local_host(host: str | None) -> bool:
    if not host:
        return True
    host = host.strip("[]").lower()
    if host in {"localhost", "homeassistant", "homeassistant.local"}:
        return True
    if host.endswith((".local", ".lan", ".home.arpa", ".internal")):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback or ip.is_link_local


async def _check_auth_providers(hass: HomeAssistant) -> list[Finding]:
    providers = list(hass.auth.auth_providers)
    types = sorted({provider.type for provider in providers})
    findings: list[Finding] = []
    for provider in providers:
        if provider.type == "legacy_api_password":
            findings.append(
                Finding(
                    "auth_legacy_api_password",
                    STATUS_FAIL,
                    "Legacy API password login is enabled",
                    "The legacy_api_password auth provider lets anyone who knows one shared password log in.",
                    "Remove the legacy_api_password provider from homeassistant: auth_providers and use user accounts with long-lived tokens.",
                    evidence={"providers": types},
                )
            )
        elif provider.type == "trusted_networks":
            bypass = bool(provider.config.get("allow_bypass_login"))
            networks = [str(net) for net in provider.config.get("trusted_networks", [])]
            findings.append(
                Finding(
                    "auth_trusted_networks",
                    STATUS_FAIL if bypass else STATUS_WARNING,
                    "Trusted networks login is enabled"
                    + (" with login bypass" if bypass else ""),
                    "Devices in these networks can log in without a password"
                    + (" and skip the login screen." if bypass else "."),
                    "Limit trusted_networks to single, fixed addresses (for example a wall tablet) and avoid allow_bypass_login.",
                    evidence={"networks": networks, "allow_bypass_login": bypass},
                )
            )
    if not findings:
        findings.append(
            Finding(
                "auth_providers",
                STATUS_PASS,
                "Only password-based login providers are enabled",
                "Enabled auth providers: " + (", ".join(types) or "none") + ".",
                evidence={"providers": types},
            )
        )
    return findings


async def _check_admin_mfa(hass: HomeAssistant) -> list[Finding]:
    users = await hass.auth.async_get_users()
    admins = [
        user
        for user in users
        if user.is_active and not user.system_generated and user.is_admin
    ]
    remote_admins = [user for user in admins if not getattr(user, "local_only", False)]
    missing: list[str] = []
    for user in remote_admins:
        enabled = await hass.auth.async_get_enabled_mfa(user)
        if not enabled:
            missing.append(user.name or user.id)
    evidence = {
        "admins": len(admins),
        "remote_admins": len(remote_admins),
        "without_mfa": missing,
        "mfa_modules": [module.id for module in hass.auth.auth_mfa_modules],
    }
    if not remote_admins:
        return [
            Finding(
                "auth_admin_mfa",
                STATUS_PASS,
                "No administrator can log in from outside the local network",
                "All active administrators are restricted to local access.",
                evidence=evidence,
            )
        ]
    if missing:
        return [
            Finding(
                "auth_admin_mfa",
                STATUS_WARNING,
                f"{len(missing)} administrator(s) without two-factor authentication",
                "Administrators without MFA: " + ", ".join(missing) + ".",
                "Each administrator can enable two-factor authentication in their profile (Security → Multi-factor authentication modules).",
                evidence=evidence,
            )
        ]
    return [
        Finding(
            "auth_admin_mfa",
            STATUS_PASS,
            "All administrators use two-factor authentication",
            f"{len(remote_admins)} administrator(s) have an MFA module enabled.",
            evidence=evidence,
        )
    ]


async def _check_transport(hass: HomeAssistant) -> list[Finding]:
    api = hass.config.api
    use_ssl = bool(api and api.use_ssl)
    external = hass.config.external_url
    parsed = urlparse(external) if external else None
    evidence = {"serves_https": use_ssl, "external_url_scheme": parsed.scheme if parsed else None}
    if use_ssl:
        return [
            Finding(
                "http_transport",
                STATUS_PASS,
                "Home Assistant serves HTTPS",
                "The built-in web server uses a TLS certificate.",
                category="network",
                evidence=evidence,
            )
        ]
    if parsed and parsed.scheme == "https":
        return [
            Finding(
                "http_transport",
                STATUS_PASS,
                "External access uses HTTPS",
                "The external URL uses HTTPS (TLS is terminated by a proxy or Home Assistant Cloud).",
                category="network",
                evidence=evidence,
            )
        ]
    if parsed and parsed.scheme == "http" and not _is_local_host(parsed.hostname):
        return [
            Finding(
                "http_transport",
                STATUS_FAIL,
                "External URL uses plain HTTP",
                "Logins and tokens sent to the external URL are not encrypted.",
                "Put Home Assistant behind HTTPS (reverse proxy, Home Assistant Cloud or a certificate) and update the external URL.",
                category="network",
                evidence=evidence,
            )
        ]
    return [
        Finding(
            "http_transport",
            STATUS_INFO,
            "Home Assistant is served over plain HTTP on the local network",
            "No external HTTPS URL is configured. This is fine for local-only use.",
            "If you open Home Assistant to the internet, use HTTPS.",
            category="network",
            evidence=evidence,
        )
    ]


async def _check_trusted_proxies(hass: HomeAssistant) -> list[Finding]:
    server = getattr(hass, "http", None)
    if server is None or not hasattr(server, "trusted_proxies"):
        return [
            Finding(
                "http_trusted_proxies",
                STATUS_SKIPPED,
                "Trusted proxies could not be read",
                "The HTTP server is not available yet.",
                category="network",
            )
        ]
    proxies = [ipaddress.ip_network(net) for net in server.trusted_proxies or []]
    listed = [str(net) for net in proxies]
    if not proxies:
        return [
            Finding(
                "http_trusted_proxies",
                STATUS_PASS,
                "No reverse proxy is trusted",
                "X-Forwarded-For headers are not trusted from any address.",
                category="network",
                evidence={"trusted_proxies": listed},
            )
        ]
    everyone = [str(net) for net in proxies if net.prefixlen == 0]
    broad_public = [
        str(net)
        for net in proxies
        if net.prefixlen and not net.is_private and net.prefixlen < (24 if net.version == 4 else 64)
    ]
    if everyone:
        return [
            Finding(
                "http_trusted_proxies",
                STATUS_FAIL,
                "Every address is trusted as a proxy",
                "trusted_proxies contains " + ", ".join(everyone) + ", so any client can fake its IP address and bypass IP bans.",
                "List only the address of your reverse proxy in trusted_proxies.",
                category="network",
                evidence={"trusted_proxies": listed},
            )
        ]
    if broad_public:
        return [
            Finding(
                "http_trusted_proxies",
                STATUS_WARNING,
                "Large public networks are trusted as proxies",
                "trusted_proxies includes " + ", ".join(broad_public) + ".",
                "Narrow trusted_proxies to the exact proxy addresses.",
                category="network",
                evidence={"trusted_proxies": listed},
            )
        ]
    return [
        Finding(
            "http_trusted_proxies",
            STATUS_PASS,
            "Trusted proxies are limited to private addresses",
            "Trusted proxies: " + ", ".join(listed) + ".",
            category="network",
            evidence={"trusted_proxies": listed},
        )
    ]


def _ban_state(app: Any) -> tuple[bool, int | None, int | None]:
    """Return (ban_enabled, login_threshold, banned_count) across HA versions."""
    manager_key: Any = "ha_banned_ips_manager"
    threshold_key: Any = "ban_manager.ip_bans_lookup"
    try:
        from homeassistant.components.http.ban import (  # noqa: PLC0415
            KEY_BAN_MANAGER,
            KEY_LOGIN_THRESHOLD,
        )

        manager_key, threshold_key = KEY_BAN_MANAGER, KEY_LOGIN_THRESHOLD
    except ImportError:  # pragma: no cover - very old cores used string keys
        pass
    if manager_key not in app:
        return False, None, None
    manager = app[manager_key]
    threshold = app.get(threshold_key)
    banned = len(getattr(manager, "ip_bans_lookup", {}) or {})
    return True, threshold, banned


async def _check_ip_ban(hass: HomeAssistant) -> list[Finding]:
    server = getattr(hass, "http", None)
    app = getattr(server, "app", None)
    if app is None:
        return [
            Finding(
                "http_ip_ban",
                STATUS_SKIPPED,
                "IP ban settings could not be read",
                "The HTTP server is not available yet.",
                category="network",
            )
        ]
    enabled, threshold, banned = _ban_state(app)
    exposed = bool(hass.config.external_url) or "cloud" in hass.config.components
    evidence = {"enabled": enabled, "login_attempts_threshold": threshold, "banned_ips": banned}
    if enabled and threshold is not None and threshold >= 1:
        return [
            Finding(
                "http_ip_ban",
                STATUS_PASS,
                "Failed logins lead to an IP ban",
                f"An address is banned after {threshold} failed login attempt(s). Banned addresses: {banned}.",
                category="network",
                evidence=evidence,
            )
        ]
    return [
        Finding(
            "http_ip_ban",
            STATUS_WARNING if exposed else STATUS_INFO,
            "Failed logins do not lead to an IP ban",
            "ip_ban_enabled is off or login_attempts_threshold is not set, so password guessing is not throttled.",
            "Set ip_ban_enabled: true and login_attempts_threshold (for example 5) in the http: section.",
            category="network",
            evidence=evidence,
        )
    ]


def _scan_plaintext_secrets(config_dir: str) -> dict[str, Any]:
    root = Path(config_dir)
    matches: list[dict[str, Any]] = []
    total = 0
    scanned = 0
    truncated = False
    for current, dirs, files in os.walk(root):
        rel_dir = Path(current).relative_to(root)
        depth = 0 if str(rel_dir) == "." else len(rel_dir.parts)
        dirs[:] = sorted(
            d for d in dirs if not d.startswith(".") and d not in _SKIP_DIRS and depth < SCAN_MAX_DEPTH
        )
        for name in sorted(files):
            if not name.endswith((".yaml", ".yml")) or name.startswith("secrets."):
                continue
            if scanned >= SCAN_MAX_FILES:
                truncated = True
                break
            path = Path(current) / name
            try:
                if path.is_symlink() or path.stat().st_size > SCAN_MAX_FILE_BYTES:
                    continue
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            scanned += 1
            for number, line in enumerate(text.splitlines(), start=1):
                stripped = line.lstrip()
                if stripped.startswith("#"):
                    continue
                match = _SECRET_KEY_RE.match(line)
                if not match:
                    continue
                value = match.group("value")
                if value.lower() in _EMPTY_VALUES or value.startswith(_SAFE_VALUE_PREFIXES):
                    continue
                total += 1
                if len(matches) < SCAN_MAX_REPORTED:
                    matches.append(
                        {"file": str(path.relative_to(root)), "line": number, "key": match.group("key")}
                    )
        if truncated:
            break
    return {"files_scanned": scanned, "total": total, "matches": matches, "truncated": truncated}


async def _check_plaintext_secrets(hass: HomeAssistant) -> list[Finding]:
    result = await hass.async_add_executor_job(_scan_plaintext_secrets, hass.config.config_dir)
    if result["total"]:
        where = ", ".join(f"{m['file']}:{m['line']} ({m['key']})" for m in result["matches"])
        more = result["total"] - len(result["matches"])
        return [
            Finding(
                "yaml_plaintext_secrets",
                STATUS_WARNING,
                f"{result['total']} secret-looking value(s) written directly in YAML",
                "Found in " + where + (f" and {more} more" if more > 0 else "") + ". Values are not shown.",
                "Move each value to secrets.yaml and reference it with !secret.",
                category="configuration",
                evidence=result,
            )
        ]
    return [
        Finding(
            "yaml_plaintext_secrets",
            STATUS_PASS,
            "No plain-text secrets found in YAML files",
            f"Scanned {result['files_scanned']} YAML file(s); passwords, tokens and keys use !secret.",
            category="configuration",
            evidence=result,
        )
    ]


CHECKS: tuple[tuple[str, Callable[[HomeAssistant], Awaitable[list[Finding]]]], ...] = (
    ("auth_providers", _check_auth_providers),
    ("auth_admin_mfa", _check_admin_mfa),
    ("http_transport", _check_transport),
    ("http_trusted_proxies", _check_trusted_proxies),
    ("http_ip_ban", _check_ip_ban),
    ("yaml_plaintext_secrets", _check_plaintext_secrets),
)


async def async_run_audit(hass: HomeAssistant) -> dict[str, Any]:
    """Run every server-side check and return a serialisable report."""
    findings: list[Finding] = []
    for check_id, check in CHECKS:
        try:
            findings.extend(await check(hass))
        except Exception as err:  # noqa: BLE001 - one broken check must not hide the rest
            _LOGGER.debug("Config Auditor check %s failed", check_id, exc_info=True)
            findings.append(
                Finding(
                    check_id,
                    STATUS_SKIPPED,
                    "Check could not run",
                    f"{type(err).__name__}: {err}",
                )
            )
    return {
        "version": VERSION,
        "generated_at": dt_util.utcnow().isoformat(),
        "findings": [finding.as_dict() for finding in findings],
    }
