"""Read an existing HA identity without creating, migrating or repairing storage."""
from __future__ import annotations

import asyncio
from hashlib import sha256
import json
import os
import re
import stat
from typing import Any

_MAX_BYTES = 4096
_SOURCE = 'core_uuid_readonly'
_SCOPE = 'current-card-audit:config-findings-v1'


def _reference(kind: str, value: Any) -> str | None:
    if not isinstance(value, str) or not value or len(value) > 255:
        return None
    digest = sha256(('ha_config_auditor:' + kind + ':' + value).encode('utf-8')).hexdigest()
    return 'c-' + digest[:32]


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate_identity_field')
        result[key] = value
    return result


def _read_instance_reference(path: str) -> str | None:
    # Store.async_load can rename corrupt JSON even in read_only mode. Reading
    # this one fixed, regular file ourselves leaves missing/corrupt data intact.
    fd = None
    try:
        flags = os.O_RDONLY | getattr(os, 'O_NONBLOCK', 0) | getattr(os, 'O_NOFOLLOW', 0)
        fd = os.open(path, flags)
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > _MAX_BYTES:
            return None
        raw = os.read(fd, _MAX_BYTES + 1)
        if len(raw) > _MAX_BYTES:
            return None
        envelope = json.loads(raw, object_pairs_hook=_unique_object)
        if (not isinstance(envelope, dict) or type(envelope.get('version')) is not int
                or envelope['version'] != 1 or envelope.get('key') != 'core.uuid'
                or type(envelope.get('minor_version', 1)) is not int
                or envelope.get('minor_version', 1) != 1):
            return None
        data = envelope.get('data')
        value = data.get('uuid') if isinstance(data, dict) else None
        if not isinstance(value, str) or not re.fullmatch(r'[a-fA-F0-9]{32}', value):
            return None
        return _reference('instance', value.lower())
    except Exception:
        # Never put the UUID, file contents, path or exception text in a result/log.
        return None
    finally:
        if fd is not None:
            os.close(fd)


async def async_report_source(hass: Any, user_id: Any, *, timeout: float = 3) -> dict[str, Any]:
    """Return only opaque source/account/scope references; unknown is explicit."""
    instance = None
    try:
        path = hass.config.path('.storage', 'core.uuid')
        instance = await asyncio.wait_for(
            hass.async_add_executor_job(_read_instance_reference, path), timeout=timeout,
        )
    except Exception:
        pass
    owner = _reference('owner', user_id)
    return {'schema': 1, 'source': _SOURCE, 'instance': instance, 'owner': owner,
            'scope': _reference('scope', _SCOPE), 'confirmed': instance is not None and owner is not None}
