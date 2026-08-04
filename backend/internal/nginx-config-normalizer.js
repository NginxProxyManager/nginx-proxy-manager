import { isIP } from "node:net";
import errs from "../lib/error.js";

export const NGINX_CONFIG_SCHEMA_VERSION = 1;
export const MATCH_TYPES = new Set(["prefix", "priority_prefix", "exact", "regex", "regex_i"]);
export const PATH_MODES = new Set(["preserve_uri", "strip_prefix", "replace_prefix"]);
const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const DURATION = /^(0|[1-9][0-9]*)(ms|s|m|h|d)?$/;
const SIZE = /^(0|[1-9][0-9]*)(k|m|g)?$/;
const VARIABLE = /^\$(?:host|scheme|remote_addr|proxy_add_x_forwarded_for|http_upgrade|http_connection|request_id)$/;
const PROTECTED_REQUEST_HEADERS = new Set([
	"host",
	"x-forwarded-scheme",
	"x-forwarded-proto",
	"x-forwarded-for",
	"x-real-ip",
]);

const clone = (value) => structuredClone(value ?? {});
const invalid = (code, message, details = {}) => {
	throw new errs.UnprocessableConfigError(message, { code, ...details });
};
const assertNoControl = (value, field) => {
	if (typeof value !== "string" || /[\r\n\0]/.test(value))
		invalid("INVALID_NGINX_VALUE", `${field} contains an invalid control character`);
};

export const normalizeDuration = (value, field = "duration") => {
	if (typeof value !== "string" || !DURATION.test(value))
		invalid("INVALID_DURATION", `${field} must be a whole nginx duration`);
	return value;
};
export const normalizeSize = (value, field = "size") => {
	if (typeof value !== "string" || !SIZE.test(value.toLowerCase()))
		invalid("INVALID_SIZE", `${field} must be a whole nginx size`);
	return value.toLowerCase();
};
export const normalizePort = (value, field = "port") => {
	if (!Number.isInteger(value) || value < 1 || value > 65535)
		invalid("INVALID_PORT", `${field} must be an integer from 1 to 65535`);
	return value;
};
export const normalizeHeaderName = (value) => {
	if (typeof value !== "string" || !HEADER_TOKEN.test(value))
		invalid("INVALID_HEADER_NAME", "Header name is invalid");
	return value;
};
export const normalizeHeaderValue = (value, mode = "literal") => {
	assertNoControl(value, "Header value");
	if (Buffer.byteLength(value, "utf8") > 8192) invalid("HEADER_VALUE_TOO_LONG", "Header value exceeds 8192 bytes");
	if (mode === "variable" && !VARIABLE.test(value))
		invalid("INVALID_HEADER_VARIABLE", "Header variable is not allowed");
	if (mode !== "literal" && mode !== "variable") invalid("INVALID_HEADER_VALUE_MODE", "Header value mode is invalid");
	return value;
};

/** @param {unknown} value */
export const normalizeNginxConfig = (value) => {
	if (value === null || typeof value === "undefined") return { schema_version: NGINX_CONFIG_SCHEMA_VERSION };
	if (typeof value !== "object" || Array.isArray(value))
		invalid("INVALID_NGINX_CONFIG", "nginx_config must be an object");
	const config = clone(value);
	if (typeof config.schema_version === "undefined") config.schema_version = NGINX_CONFIG_SCHEMA_VERSION;
	if (config.schema_version !== NGINX_CONFIG_SCHEMA_VERSION) {
		invalid("UNSUPPORTED_NGINX_CONFIG_SCHEMA", `nginx_config schema ${config.schema_version} is not supported`);
	}
	return config;
};

const normalizePath = (path, matchType) => {
	assertNoControl(path, "Location path");
	if (!path || Buffer.byteLength(path, "utf8") > 1024) invalid("INVALID_LOCATION_PATH", "Location path is invalid");
	if (matchType === "regex" || matchType === "regex_i") return path;
	if (!path.startsWith("/")) invalid("INVALID_LOCATION_PATH", "Location path must start with /");
	return path;
};

export const normalizeUpstreamHost = (host) => {
	assertNoControl(host, "Upstream host");
	if (!host || host.includes("://") || host.includes("@") || host.includes("?") || host.includes("#")) {
		invalid("INVALID_UPSTREAM_HOST", "Upstream host must not contain a scheme, credentials, query, or fragment");
	}
	if (host.includes("/") || /\s/.test(host))
		invalid("INVALID_UPSTREAM_HOST", "Upstream host must not contain a path or whitespace");
	if (host.startsWith("[") ? !/^\[[0-9a-fA-F:.]+\]$/.test(host) : !/^[A-Za-z0-9.-]+$/.test(host)) {
		invalid("INVALID_UPSTREAM_HOST", "Upstream host must be DNS, IPv4, or bracketed IPv6");
	}
	return host;
};

const normalizeHeaderOperations = (items, field) => {
	if (typeof items === "undefined") return undefined;
	if (!Array.isArray(items)) invalid("INVALID_HEADERS", `${field} must be an array`);
	const seen = new Set();
	return items.map((item, index) => {
		if (!item || typeof item !== "object" || Array.isArray(item))
			invalid("INVALID_HEADERS", `${field}[${index}] must be an object`);
		const name = normalizeHeaderName(item.name);
		const key = name.toLowerCase();
		if (seen.has(key)) invalid("DUPLICATE_HEADER", `${field} contains duplicate header ${name}`);
		seen.add(key);
		const operation = item.operation || "set";
		if (operation !== "set" && operation !== "remove" && operation !== "add")
			invalid("INVALID_HEADER_OPERATION", "Header operation is invalid");
		if (operation === "remove") {
			if (field === "request_headers" && PROTECTED_REQUEST_HEADERS.has(key))
				invalid("PROTECTED_HEADER_REMOVE", `Header ${name} is managed by the system`);
			return { name, operation };
		}
		const value_mode = item.value_mode || "literal";
		return { name, operation, value_mode, value: normalizeHeaderValue(item.value, value_mode) };
	});
};

const DEFAULTABLE_BOOLEAN_FIELDS = [
	"default_location_enabled",
	"proxy_buffering",
	"proxy_request_buffering",
	"proxy_ssl_server_name",
	"proxy_ignore_client_abort",
	"proxy_intercept_errors",
	"proxy_force_ranges",
	"proxy_pass_request_body",
	"proxy_pass_request_headers",
	"proxy_pass_trailers",
	"proxy_socket_keepalive",
	"proxy_ssl_session_reuse",
	"proxy_ssl_verify",
];
const DURATION_FIELDS = [
	"proxy_connect_timeout",
	"proxy_send_timeout",
	"proxy_read_timeout",
	"proxy_next_upstream_timeout",
];
const SIZE_FIELDS = [
	"client_max_body_size",
	"proxy_buffer_size",
	"proxy_busy_buffers_size",
	"proxy_max_temp_file_size",
	"proxy_temp_file_write_size",
	"proxy_limit_rate",
];
const INTEGER_FIELDS = [
	"proxy_headers_hash_bucket_size",
	"proxy_headers_hash_max_size",
	"proxy_next_upstream_tries",
	"proxy_ssl_verify_depth",
];
const HTTP_VERSIONS = new Set(["1.0", "1.1"]);
const NEXT_UPSTREAM_VALUES = new Set([
	"error",
	"timeout",
	"invalid_header",
	"http_500",
	"http_502",
	"http_503",
	"http_504",
	"http_403",
	"http_404",
	"http_429",
	"non_idempotent",
	"off",
]);
const IGNORE_HEADER_VALUES = new Set([
	"X-Accel-Expires",
	"X-Accel-Redirect",
	"X-Accel-Limit-Rate",
	"X-Accel-Buffering",
	"X-Accel-Charset",
	"Expires",
	"Cache-Control",
	"Set-Cookie",
	"Vary",
]);
const SSL_PROTOCOL_VALUES = new Set(["TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"]);
const METHOD = /^[A-Z][A-Z0-9_-]{0,31}$/;
const CIPHER_LIST = /^[A-Za-z0-9_!+\-:@.]+$/;
const COOKIE_VALUE = /^[^\s;{}"'\\]+$/;

const optionalText = (value, field, pattern, message) => {
	if (typeof value !== "string") invalid("INVALID_NGINX_VALUE", `${field} must be a string`);
	const text = value.trim();
	if (!text) return undefined;
	assertNoControl(text, field);
	if (!pattern.test(text)) invalid("INVALID_NGINX_VALUE", message || `${field} is invalid`);
	return text;
};

const normalizeStringArray = (items, field, allowed) => {
	if (!Array.isArray(items)) invalid("INVALID_NGINX_LIST", `${field} must be an array`);
	const values = [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
	for (const item of values) {
		if (allowed ? !allowed.has(item) : !HEADER_TOKEN.test(item))
			invalid("INVALID_NGINX_LIST", `${field} contains an unsupported value`);
	}
	return values;
};

const normalizeCookieRewrites = (items, field) => {
	if (!Array.isArray(items)) invalid("INVALID_COOKIE_REWRITES", `${field} must be an array`);
	if (items.length > 32) invalid("INVALID_COOKIE_REWRITES", `${field} may contain at most 32 rules`);
	return items.map((item, index) => {
		if (!item || typeof item !== "object" || Array.isArray(item))
			invalid("INVALID_COOKIE_REWRITES", `${field}[${index}] must be an object`);
		const from = optionalText(item.from, `${field}[${index}].from`, COOKIE_VALUE);
		const to = optionalText(item.to, `${field}[${index}].to`, COOKIE_VALUE);
		if (!from || !to) invalid("INVALID_COOKIE_REWRITES", `${field}[${index}] requires from and to values`);
		return { from, to };
	});
};

const normalizeOptions = (options, field) => {
	if (typeof options === "undefined" || options === null) return {};
	if (typeof options !== "object" || Array.isArray(options))
		invalid("INVALID_NGINX_OPTIONS", `${field} must be an object`);
	const result = {};
	for (const key of DURATION_FIELDS) {
		if (typeof options[key] !== "undefined" && options[key] !== "")
			result[key] = normalizeDuration(options[key], key);
	}
	for (const key of SIZE_FIELDS) {
		if (typeof options[key] !== "undefined" && options[key] !== "") result[key] = normalizeSize(options[key], key);
	}
	for (const key of INTEGER_FIELDS) {
		if (typeof options[key] !== "undefined" && options[key] !== "") {
			const minimum = ["proxy_headers_hash_bucket_size", "proxy_headers_hash_max_size"].includes(key) ? 1 : 0;
			if (!Number.isInteger(options[key]) || options[key] < minimum || options[key] > 2147483647)
				invalid("INVALID_NGINX_INTEGER", `${key} must be a whole integer of at least ${minimum}`);
			result[key] = options[key];
		}
	}
	for (const key of DEFAULTABLE_BOOLEAN_FIELDS) {
		if (typeof options[key] !== "undefined") {
			if (typeof options[key] !== "boolean") invalid("INVALID_NGINX_BOOLEAN", `${key} must be boolean`);
			result[key] = options[key];
		}
	}
	if (typeof options.proxy_buffers !== "undefined") {
		if (
			!Array.isArray(options.proxy_buffers) ||
			options.proxy_buffers.length !== 2 ||
			!Number.isInteger(options.proxy_buffers[0]) ||
			options.proxy_buffers[0] < 1
		) {
			invalid("INVALID_PROXY_BUFFERS", "proxy_buffers must be [count, size]");
		}
		result.proxy_buffers = [
			options.proxy_buffers[0],
			normalizeSize(options.proxy_buffers[1], "proxy_buffers size"),
		];
	}
	if (typeof options.proxy_http_version !== "undefined" && options.proxy_http_version !== "") {
		if (!HTTP_VERSIONS.has(options.proxy_http_version))
			invalid("INVALID_PROXY_HTTP_VERSION", "proxy_http_version must be 1.0 or 1.1");
		result.proxy_http_version = options.proxy_http_version;
	}
	if (typeof options.proxy_method !== "undefined" && options.proxy_method !== "")
		result.proxy_method = optionalText(options.proxy_method, "proxy_method", METHOD, "proxy_method is invalid");
	if (typeof options.proxy_ssl_name !== "undefined" && options.proxy_ssl_name !== "")
		result.proxy_ssl_name = normalizeUpstreamHost(options.proxy_ssl_name);
	if (typeof options.proxy_ssl_ciphers !== "undefined" && options.proxy_ssl_ciphers !== "")
		result.proxy_ssl_ciphers = optionalText(
			options.proxy_ssl_ciphers,
			"proxy_ssl_ciphers",
			CIPHER_LIST,
			"proxy_ssl_ciphers is invalid",
		);
	if (typeof options.proxy_ssl_protocols !== "undefined") {
		const protocols = normalizeStringArray(options.proxy_ssl_protocols, "proxy_ssl_protocols", SSL_PROTOCOL_VALUES);
		if (!protocols.length) invalid("INVALID_SSL_PROTOCOLS", "proxy_ssl_protocols may not be empty");
		result.proxy_ssl_protocols = protocols;
	}
	if (typeof options.proxy_next_upstream !== "undefined") {
		const next = normalizeStringArray(options.proxy_next_upstream, "proxy_next_upstream", NEXT_UPSTREAM_VALUES);
		if (!next.length || (next.includes("off") && next.length !== 1))
			invalid("INVALID_PROXY_NEXT_UPSTREAM", "proxy_next_upstream must contain conditions, or only off");
		result.proxy_next_upstream = next;
	}
	if (typeof options.proxy_ignore_headers !== "undefined")
		result.proxy_ignore_headers = normalizeStringArray(
			options.proxy_ignore_headers,
			"proxy_ignore_headers",
			IGNORE_HEADER_VALUES,
		);
	if (typeof options.proxy_pass_headers !== "undefined")
		result.proxy_pass_headers = normalizeStringArray(options.proxy_pass_headers, "proxy_pass_headers");
	if (typeof options.proxy_cookie_domain !== "undefined")
		result.proxy_cookie_domain = normalizeCookieRewrites(options.proxy_cookie_domain, "proxy_cookie_domain");
	if (typeof options.proxy_cookie_path !== "undefined")
		result.proxy_cookie_path = normalizeCookieRewrites(options.proxy_cookie_path, "proxy_cookie_path");
	if (typeof options.proxy_redirect !== "undefined" && options.proxy_redirect !== "") {
		if (!["default", "off"].includes(options.proxy_redirect))
			invalid("INVALID_PROXY_REDIRECT", "proxy_redirect must be default or off");
		result.proxy_redirect = options.proxy_redirect;
	}
	if (typeof options.proxy_bind !== "undefined" && options.proxy_bind !== "") {
		const bind = optionalText(
			options.proxy_bind,
			"proxy_bind",
			/^[0-9A-Fa-f:.]+$/,
			"proxy_bind must be an IP address",
		);
		if (!bind || !isIP(bind.replace(/^\[|\]$/g, "")))
			invalid("INVALID_PROXY_BIND", "proxy_bind must be an IP address");
		result.proxy_bind = bind;
	}
	const requestHeaders = normalizeHeaderOperations(options.request_headers, "request_headers");
	if (requestHeaders) result.request_headers = requestHeaders;
	const responseHeaders = normalizeHeaderOperations(options.response_headers, "response_headers");
	if (responseHeaders) result.response_headers = responseHeaders;
	if (typeof options.hide_response_headers !== "undefined") {
		if (!Array.isArray(options.hide_response_headers))
			invalid("INVALID_HEADERS", "hide_response_headers must be an array");
		result.hide_response_headers = [
			...new Set(options.hide_response_headers.map(normalizeHeaderName).map((name) => name.toLowerCase())),
		].sort();
	}
	return result;
};

export const normalizeProxyTarget = (target, legacy = {}, label = "target") => {
	const value = target ?? {
		type: "direct",
		scheme: legacy.forward_scheme,
		host: legacy.forward_host,
		port: legacy.forward_port,
	};
	if (!value || typeof value !== "object" || Array.isArray(value))
		invalid("INVALID_PROXY_TARGET", `${label} must be an object`);
	const type = value.type || "direct";
	if (type === "direct") {
		if (typeof value.scheme !== "string" || !["http", "https"].includes(value.scheme))
			invalid("INVALID_FORWARD_SCHEME", `${label}.scheme must be http or https`);
		return {
			type,
			scheme: value.scheme,
			host: normalizeUpstreamHost(value.host),
			port: normalizePort(value.port, `${label}.port`),
		};
	}
	if (type === "upstream") {
		if (typeof value.scheme !== "string" || !["http", "https"].includes(value.scheme))
			invalid("INVALID_FORWARD_SCHEME", `${label}.scheme must be http or https`);
		const upstreamId = Number(value.upstream_id);
		if (!Number.isInteger(upstreamId) || upstreamId < 1)
			invalid("INVALID_UPSTREAM_TARGET", `${label}.upstream_id must be a positive integer`);
		return { type, scheme: value.scheme, upstream_id: upstreamId };
	}
	invalid("INVALID_PROXY_TARGET", `${label}.type must be direct or upstream`);
};

export const normalizeLocation = (location, index = 0) => {
	if (!location || typeof location !== "object" || Array.isArray(location))
		invalid("INVALID_LOCATION", `Location ${index} must be an object`);
	const value = clone(location);
	const target = normalizeProxyTarget(value.target, value, `locations[${index}].target`);
	const legacyHostWithPath = typeof value.forward_host === "string" && value.forward_host.includes("/");
	const match_type = value.match_type || "prefix";
	if (!MATCH_TYPES.has(match_type))
		invalid("INVALID_LOCATION_MATCH_TYPE", "Location match_type is invalid", { index });
	let path_mode = value.path_mode || "preserve_uri";
	if (!PATH_MODES.has(path_mode)) invalid("INVALID_LOCATION_PATH_MODE", "Location path_mode is invalid", { index });
	let forward_host = value.forward_host;
	let forward_path = value.forward_path;
	const warnings = [];
	if (legacyHostWithPath) {
		const slash = value.forward_host.indexOf("/");
		forward_host = value.forward_host.slice(0, slash);
		forward_path = value.forward_host.slice(slash) || "/";
		if (match_type === "prefix" && value.path?.startsWith("/") && value.path?.endsWith("/")) {
			path_mode = "replace_prefix";
		} else {
			warnings.push({
				severity: "warning",
				code: "LEGACY_LOCATION_REQUIRES_REVIEW",
				scope: "location",
				path: value.path,
				message: "Legacy upstream URI is retained in compatibility mode",
			});
		}
	}
	const path = normalizePath(value.path, match_type);
	if (target.type === "direct") {
		forward_host = target.host;
		value.forward_port = target.port;
		value.forward_scheme = target.scheme;
	} else {
		// Legacy fields remain as a storage compatibility mirror. Rendering uses target.
		forward_host = value.forward_host || "upstream";
		value.forward_port = value.forward_port || 80;
		value.forward_scheme = target.scheme;
	}
	if (!warnings.length && target.type === "direct") forward_host = normalizeUpstreamHost(forward_host);
	if (["exact", "regex", "regex_i"].includes(match_type) && path_mode !== "preserve_uri")
		invalid("INVALID_LOCATION_PATH_MODE", `${match_type} locations only support preserve_uri`);
	if (
		["strip_prefix", "replace_prefix"].includes(path_mode) &&
		(match_type === "regex" ||
			match_type === "regex_i" ||
			!path.startsWith("/") ||
			!path.endsWith("/") ||
			path === "/")
	) {
		invalid(
			"INVALID_LOCATION_URI_COMBINATION",
			"strip/replace locations require a non-root slash-terminated prefix path",
		);
	}
	if (path_mode === "replace_prefix") {
		assertNoControl(forward_path, "forward_path");
		if (!forward_path?.startsWith("/") || !forward_path.endsWith("/"))
			invalid("INVALID_FORWARD_PATH", "replace_prefix requires a slash-terminated forward_path");
	}
	return {
		...value,
		target,
		forward_host,
		forward_port: value.forward_port,
		match_type,
		path_mode,
		...(typeof forward_path === "string" ? { forward_path } : {}),
		nginx_config: normalizeOptions(value.nginx_config, `locations[${index}].nginx_config`),
		_normalization_warnings: warnings,
	};
};

const RESERVED_PORT_LISTENER_PORTS = new Set([80, 81, 443]);

const normalizeListener = (listener) => {
	if (typeof listener === "undefined" || listener === null) return { mode: "domain" };
	if (typeof listener !== "object" || Array.isArray(listener))
		invalid("INVALID_LISTENER", "nginx_config.listener must be an object");
	const mode = listener.mode || "domain";
	if (mode === "domain") return { mode };
	if (mode !== "port") invalid("INVALID_LISTENER_MODE", "nginx_config.listener.mode must be domain or port");
	const port = normalizePort(listener.port, "nginx_config.listener.port");
	if (RESERVED_PORT_LISTENER_PORTS.has(port))
		invalid("RESERVED_LISTENER_PORT", `nginx_config.listener.port ${port} is reserved by Nginx Proxy Manager`);
	return { mode, port };
};

export const normalizeProxyHost = (host) => {
	if (!host || typeof host !== "object") invalid("INVALID_PROXY_HOST", "Proxy Host must be an object");
	const value = clone(host);
	value.nginx_config = normalizeNginxConfig(value.nginx_config);
	value.nginx_listener = normalizeListener(value.nginx_config.listener);
	if (value.nginx_listener.mode === "domain" && (!Array.isArray(value.domain_names) || !value.domain_names.length))
		invalid("DOMAIN_LISTENER_REQUIRES_DOMAINS", "A domain listener requires at least one domain_name");
	if (value.nginx_listener.mode === "port") {
		if (Array.isArray(value.domain_names) && value.domain_names.length)
			invalid("PORT_LISTENER_REQUIRES_NO_DOMAINS", "A port listener cannot include domain_names");
		if (
			Number(value.certificate_id || 0) > 0 ||
			value.ssl_forced ||
			value.http2_support ||
			value.hsts_enabled ||
			value.hsts_subdomains
		)
			invalid(
				"PORT_LISTENER_TLS_UNSUPPORTED",
				"A port listener currently supports HTTP only; remove the TLS settings",
			);
	}
	value.nginx_options = normalizeOptions(
		value.nginx_config.server || value.nginx_config.options,
		"nginx_config.server",
	);
	value.default_target = normalizeProxyTarget(value.default_target, value, "default_target");
	if (value.default_target.type === "direct") {
		value.forward_scheme = value.default_target.scheme;
		value.forward_host = value.default_target.host;
		value.forward_port = value.default_target.port;
	} else {
		value.forward_scheme = value.default_target.scheme;
		value.forward_host ||= "upstream";
		value.forward_port ||= 80;
	}
	value.locations = (value.locations || []).map(normalizeLocation);
	return value;
};

export default {
	normalizeNginxConfig,
	normalizeProxyHost,
	normalizeLocation,
	normalizeProxyTarget,
	normalizeUpstreamHost,
	normalizeDuration,
	normalizeSize,
	normalizePort,
	normalizeHeaderName,
	normalizeHeaderValue,
};
