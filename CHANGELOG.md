## 6.0.0 (2026-09-24)

- New: **Config Auditor integration** (`custom_components/ha_config_auditor`). It verifies on the server what a browser card cannot read: enabled login providers (`legacy_api_password`, `trusted_networks` with or without login bypass), administrators without two-factor authentication, HTTPS, `trusted_proxies`, IP ban after failed logins, and plain-text secrets in YAML files (reported as file, line and key only; values are never returned).
- New: admin-only **Config Auditor** sidebar panel and automatic dashboard registration of the card (a Lovelace resource in storage mode; skipped when the card is already loaded from a HACS Dashboard install). Both can be controlled in the integration options.
- New: optional **Repairs** issues for failed and warning checks, refreshed after start-up and every 12 hours, removed once a check passes.
- Fix: the card no longer reports browser-side guesses as results. Removed checks that could never be true or false in a browser (`config/core/info`, `config/ip_ban`, `hass.config.auth_providers`, `hass.config.login_attempts_threshold` — the last one always produced a false warning). Without the integration the card says these checks are unavailable.
- Fix: integrations are listed again (`config_entries/get`; the previous `config_entries/list` command does not exist).
- Server-verified findings carry a **Server-verified** badge; checks that could not run are shown as *not checked*.
- Minimum Home Assistant version for the integration: 2025.2.0. The Dashboard plugin install keeps working.
- New banner and brand icons (the old banner still said "Security Check").

## 5.0.6 (2026-08-28)

- Isolation: Bento CSS is component-local and cannot be captured from `window.HAToolsBentoCSS` by load order.
- Isolation: persistence is now card-local, removing `window._haToolsPersistence` load-order coupling while retaining existing localStorage keys.
- Security: remove the suite-wide DOM/shadow-root injector; intro and support UI now render only inside this card.
- Security: normalize non-string values before inherited escaping and escape audit/network data at final HTML sinks.
- Test: add foreign-card isolation, no-document-observer, persisted dismiss, editor and hostile-array runtime checks.

## 5.0.5 (2026-07-18)

- Fix (UI): the small accent dot before section titles no longer detaches from the title text (it was pushed to the opposite edge by the header's flex space-between); it is now pinned next to the title.

# Changelog — Config Auditor

## [5.0.2] - 2026-06-15

- Theme: dark/light now follows the active Home Assistant theme (luminance of --card-background-color) instead of OS prefers-color-scheme.


## [5.0.1] - 2026-06-15

- Theme: dark/light now follows the active Home Assistant theme (luminance of --card-background-color) instead of OS prefers-color-scheme.


## [4.1.3] - 2026-05-12

### Fixed
- Removed Google Fonts CDN @import (1 occurrence(s)); now uses system font stack with Inter as the preferred locally-installed face.
- Normalized bare `font-family: "Inter", sans-serif` declarations to a complete cross-platform system stack.
- Privacy section in README: claim now matches behaviour (no CDN dependencies).

All notable changes to **Config Auditor** are documented here.

## [4.0.0] - 2026-05-10

### Major
- **Split from `MacSiem/ha-tools` monorepo** into a dedicated standalone HACS plugin.
- Bundled Bento Design System CSS inline — no shared dependency required.
- Inlined `_haToolsEsc` XSS sanitizer.
- Persistence keys migrated to per-tool namespace `ha-config-auditor-…` (clean break — old data under `ha-tools-…` is **not** migrated automatically).
- Donation/support footer added to the panel.
- Cross-tool discovery banner removed; each tool stands on its own.

### Compatibility

- Home Assistant ≥ 2024.1.0
