import { PROXY_DIRECTIVE_CATALOG, PROXY_DIRECTIVE_ENTRIES } from "./nginx-proxy-directive-catalog.js";

/** Product-owned proxy defaults, generated from the directive catalog. */
export const PROXY_OPTION_PROFILE_VERSION = PROXY_DIRECTIVE_CATALOG.profileVersion;

export const PROXY_LOCATION_OPTION_DEFAULTS = Object.freeze(
	Object.fromEntries(PROXY_DIRECTIVE_ENTRIES.map((entry) => [entry.key, structuredClone(entry.profileValue)])),
);
export const PROXY_LOCATION_OPTION_KEYS = Object.freeze(PROXY_DIRECTIVE_ENTRIES.map((entry) => entry.key));
export const PROXY_SERVER_OPTION_KEYS = Object.freeze(["default_location_enabled", ...PROXY_LOCATION_OPTION_KEYS]);

const cloneDefaults = () => structuredClone(PROXY_LOCATION_OPTION_DEFAULTS);

export const materializeProxyLocationOptions = (options = {}) => ({
	...cloneDefaults(),
	...(options ?? {}),
});

export const materializeProxyServerOptions = (options = {}) => ({
	default_location_enabled: PROXY_DIRECTIVE_CATALOG.defaultLocationEnabled,
	...materializeProxyLocationOptions(options),
});

export default {
	PROXY_OPTION_PROFILE_VERSION,
	PROXY_LOCATION_OPTION_DEFAULTS,
	PROXY_LOCATION_OPTION_KEYS,
	PROXY_SERVER_OPTION_KEYS,
	materializeProxyLocationOptions,
	materializeProxyServerOptions,
};
