# 🧰 Config Auditor

![Preview](banner.png)

Configuration best-practices checker for Home Assistant — reviews tokens, exposure and integration hygiene, and reports passed / warning / failed checks with actionable tips. It is a heuristic, client-side review aid, not a security scanner.

[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.1+-blue.svg?logo=homeassistant)](https://www.home-assistant.io/) [![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE) [![Version](https://img.shields.io/github/v/release/MacSiem/ha-config-auditor)](https://github.com/MacSiem/ha-config-auditor/releases)

> Part of the [HA Tools](https://github.com/MacSiem) ecosystem — split into individual HACS-installable plugins.

## Installation (HACS)

1. Open HACS → Frontend → ⋮ → **Custom repositories**
2. Repository URL: `https://github.com/MacSiem/ha-config-auditor` — Category: **Lovelace**
3. Install **Config Auditor** from HACS
4. Restart Home Assistant

## Usage

### Lovelace card

```yaml
type: custom:ha-config-auditor
```

### Optional sidebar panel (`configuration.yaml`)

```yaml
panel_custom:
  - name: ha-config-auditor
    sidebar_title: Config Auditor
    sidebar_icon: mdi:home-assistant
    url_path: ha-config-auditor
    js_url: /local/community/ha-config-auditor/ha-config-auditor.js
    embed_iframe: false
    config: {}
```

After restart, **Config Auditor** appears in the HA sidebar.

## Features

- Best-practices checks for tokens, exposure and integration hygiene with passed / warning / failed summary.
- Actionable tips per finding — review aid only, validate in HA settings before acting.
- Bundled Bento Design System (light + dark mode, mobile-friendly)
- Self-contained — no shared HA Tools dependency
- Tool settings and dismissed-banner state are cached in browser `localStorage`
## Privacy

- No telemetry, no analytics, no tracking
- No external network calls, no CDN-hosted assets (system fonts only)
- No data leaves your device (no external network calls)
## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Support

If this tool makes your Home Assistant life easier, consider supporting development:

- [☕ Buy Me a Coffee](https://buymeacoffee.com/macsiem)
- [💳 PayPal](https://www.paypal.com/donate/?hosted_button_id=Y967H4PLRBN8W)

## License

MIT — see [LICENSE](LICENSE).
