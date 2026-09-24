"""Config and options flow for Config Auditor."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback

from .const import (
    CONF_CREATE_REPAIRS,
    CONF_SHOW_PANEL,
    DEFAULT_CREATE_REPAIRS,
    DEFAULT_SHOW_PANEL,
    DOMAIN,
    NAME,
)


class ConfigAuditorConfigFlow(ConfigFlow, domain=DOMAIN):
    """Zero-input, single-instance setup."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Create the entry."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title=NAME, data={})

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        """Return the options flow."""
        return ConfigAuditorOptionsFlow()


class ConfigAuditorOptionsFlow(OptionsFlow):
    """Sidebar panel and Repairs toggles."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Show the options."""
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        options = self.config_entry.options
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_SHOW_PANEL, default=options.get(CONF_SHOW_PANEL, DEFAULT_SHOW_PANEL)
                    ): bool,
                    vol.Required(
                        CONF_CREATE_REPAIRS,
                        default=options.get(CONF_CREATE_REPAIRS, DEFAULT_CREATE_REPAIRS),
                    ): bool,
                }
            ),
        )
