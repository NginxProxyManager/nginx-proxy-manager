import { PROXY_DIRECTIVE_ENTRIES } from "./nginx-proxy-directive-catalog.js";
import { flattenProxyOptionSections, groupProxyOptions, NGINX_CONFIG_SCHEMA_VERSION } from "./nginx-config-normalizer.js";
import { materializeProxyLocationOptions } from "./nginx-proxy-option-profile.js";

const migratedExplicitServerKeys = (host) => {
	if (host.nginx_config_migration_status !== "migrated") return null;
	const legacy = host.nginx_config_migration_backup?.nginx_config;
	if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) return null;
	const options = legacy.server ?? legacy.options ?? {};
	if (!options || typeof options !== "object" || Array.isArray(options)) return new Set();
	return new Set(Object.keys(options));
};

const serverFieldSource = (explicitLegacyKeys, key) =>
	explicitLegacyKeys === null || explicitLegacyKeys.has(key) ? "user" : "profile";

const makeSourceRecord = (key, value, source, extra = {}) => ({
	field: key,
	frontend_field: PROXY_DIRECTIVE_ENTRIES.find((entry) => entry.key === key)?.frontendKey ?? key,
	value: structuredClone(value),
	source,
	...extra,
});

const feature = (field, frontendField, enabled, source, expandedDirectives, extra = {}) => ({
	field,
	frontend_field: frontendField,
	enabled: Boolean(enabled),
	source,
	expanded_directives: enabled ? expandedDirectives : [],
	...extra,
});

const resolveFeatures = (host) => ({
	caching_enabled: feature(
		"caching_enabled",
		"cachingEnabled",
		host.caching_enabled,
		"user",
		["location", "if_modified_since", "proxy_cache", "proxy_cache_key", "proxy_cache_valid", "proxy_cache_bypass", "proxy_no_cache", "proxy_cache_use_stale", "expires", "access_log"],
	),
	allow_websocket_upgrade: feature(
		"allow_websocket_upgrade",
		"allowWebsocketUpgrade",
		host.allow_websocket_upgrade,
		"user",
		["proxy_set_header Upgrade", "proxy_set_header Connection"],
	),
	block_exploits: feature(
		"block_exploits",
		"blockExploits",
		host.block_exploits,
		"user",
		["location", "deny", "return"],
	),
	certificate_id: feature(
		"certificate_id",
		"certificateId",
		Number(host.certificate_id || 0) > 0,
		"user",
		["ssl_session_timeout", "ssl_session_cache", "ssl_protocols", "ssl_ciphers", "ssl_prefer_server_ciphers", "ssl_certificate", "ssl_certificate_key"],
		{ value: Number(host.certificate_id || 0) },
	),
	ssl_forced: feature(
		"ssl_forced",
		"sslForced",
		Number(host.certificate_id || 0) > 0 && host.ssl_forced,
		"user",
		["set", "if", "return"],
	),
	hsts_enabled: feature(
		"hsts_enabled",
		"hstsEnabled",
		Number(host.certificate_id || 0) > 0 && host.ssl_forced && host.hsts_enabled,
		"user",
		["add_header Strict-Transport-Security"],
	),
	access_list_id: feature(
		"access_list_id",
		"accessListId",
		Number(host.access_list_id || 0) > 0,
		"user",
		["auth_basic", "auth_basic_user_file", "allow", "deny", "satisfy"],
		{ value: Number(host.access_list_id || 0) },
	),
	monitoring_logs: feature(
		"monitoring_logs",
		null,
		true,
		"system",
		["access_log", "error_log"],
	),
});

export const resolveEffectiveProxyConfig = (normalizedHost) => {
	const server = materializeProxyLocationOptions(normalizedHost.nginx_options);
	const explicitLegacyKeys = migratedExplicitServerKeys(normalizedHost);
	const serverSources = Object.fromEntries(
		PROXY_DIRECTIVE_ENTRIES.map((entry) => [
			entry.key,
			makeSourceRecord(entry.key, server[entry.key], serverFieldSource(explicitLegacyKeys, entry.key), {
				scope: "default_policy",
				path: "/",
			}),
		]),
	);
	const locations = normalizedHost.locations.map((location, index) => {
		const overrides = flattenProxyOptionSections(
			location.nginx_config?.overrides ?? {},
			`locations[${index}].nginx_config.overrides`,
		);
		const effective = materializeProxyLocationOptions({ ...server, ...overrides });
		const sources = Object.fromEntries(
			PROXY_DIRECTIVE_ENTRIES.map((entry) => {
				const overridden = Object.hasOwn(overrides, entry.key);
				return [
					entry.key,
					makeSourceRecord(entry.key, effective[entry.key], overridden ? "user" : "inherited", {
						scope: "location",
						location_id: location.location_id ?? null,
						path: location.path,
						...(overridden ? {} : { inherited_from: "nginx_config.server" }),
					}),
				];
			}),
		);
		return {
			location_id: location.location_id ?? null,
			path: location.path,
			match_type: location.match_type,
			mode: "inherit",
			overrides: groupProxyOptions(overrides),
			effective: groupProxyOptions(effective),
			effective_flat: effective,
			sources,
		};
	});
	return {
		schema_version: NGINX_CONFIG_SCHEMA_VERSION,
		profile_version: normalizedHost.nginx_config.profile_version,
		server: {
			effective: groupProxyOptions(server),
			effective_flat: server,
			sources: serverSources,
		},
		locations,
		features: resolveFeatures(normalizedHost),
	};
};

export default { resolveEffectiveProxyConfig };
