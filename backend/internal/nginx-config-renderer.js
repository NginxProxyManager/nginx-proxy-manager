import fs from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { hasDiagnosticErrors, scanAdvancedConfig } from "./nginx-config-diagnostics.js";
import { resolveEffectiveProxyConfig } from "./nginx-proxy-effective-resolver.js";
import { buildProxySourceMap } from "./nginx-proxy-source-map.js";
import { validateNginxCapability } from "./nginx-runtime-capability.js";
import { hashCanonical, hashFileManifest, sha256 } from "./nginx-config-hash.js";
import { normalizeProxyHost } from "./nginx-config-normalizer.js";
import { buildSnapshot, getHostAdapter } from "./nginx-host-adapters.js";
import { PROXY_OPTION_PROFILE_VERSION } from "./nginx-proxy-option-profile.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(__dirname, "../templates");
const TEMPLATE_VERSION = "nginx-config-renderer-v4";
const PROTECTED_HEADERS = new Set(["host", "x-forwarded-scheme", "x-forwarded-proto", "x-forwarded-for", "x-real-ip"]);

const quote = (value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")}"`;
const directiveBoolean = (value) => (value ? "on" : "off");
const asLf = (value) => `${String(value).replace(/\r\n?/g, "\n").replace(/[\t ]+\n/g, "\n").replace(/\n*$/, "")}\n`;

const renderPortOnlyListener = (config, listener, ipv6) => {
	const start = config.indexOf("  listen 80;");
	const end = config.indexOf("http2 off;", start);
	if (start < 0 || end < 0) throw new errs.UnprocessableConfigError("Unable to render the port-only listener");
	const port = listener.port;
	const listen = [
		`  listen ${port} default_server;`,
		ipv6 ? `listen [::]:${port} default_server;` : `#listen [::]:${port} default_server;`,
		"",
		"",
		"  server_name _;",
		"http2 off;",
	].join("\n");
	return `${config.slice(0, start)}${listen}${config.slice(end + "http2 off;".length)}`;
};

const readTemplateManifest = async (template) => {
	const files = [
		template,
		"_header_comment.conf",
		"_hsts_map.conf",
		"_location.conf",
		"_access.conf",
		"_assets.conf",
		"_certificates.conf",
		"_exploits.conf",
		"_forced_ssl.conf",
		"_hsts.conf",
		"_listen.conf",
	];
	const entries = [];
	for (const name of files) {
		try {
			entries.push({ path: name, content: await fs.readFile(join(templatesDir, name)) });
		} catch (error) {
			if (name === template) throw error;
		}
	}
	return hashFileManifest(entries);
};

const renderRequestHeaders = (options, websocket, useProxyIncludeDefaults = false) => {
	const values = new Map([
		["host", { name: "Host", value: "$host", variable: true, protected: true }],
		[
			"x-forwarded-scheme",
			{
				name: "X-Forwarded-Scheme",
				value: useProxyIncludeDefaults ? "$x_forwarded_scheme" : "$scheme",
				variable: true,
				protected: true,
			},
		],
		[
			"x-forwarded-proto",
			{
				name: "X-Forwarded-Proto",
				value: useProxyIncludeDefaults ? "$x_forwarded_proto" : "$scheme",
				variable: true,
				protected: true,
			},
		],
		[
			"x-forwarded-for",
			{
				name: "X-Forwarded-For",
				value: useProxyIncludeDefaults ? "$proxy_add_x_forwarded_for" : "$remote_addr",
				variable: true,
				protected: true,
			},
		],
		["x-real-ip", { name: "X-Real-IP", value: "$remote_addr", variable: true, protected: true }],
	]);
	if (websocket) {
		values.set("upgrade", { name: "Upgrade", value: "$http_upgrade", variable: true });
		values.set("connection", { name: "Connection", value: "$http_connection", variable: true });
	}
	for (const operation of options.request_headers || []) {
		const key = operation.name.toLowerCase();
		if (operation.operation === "remove") {
			if (PROTECTED_HEADERS.has(key))
				throw new errs.UnprocessableConfigError("A system proxy header cannot be removed", {
					code: "PROTECTED_HEADER_REMOVE",
					header: operation.name,
				});
			values.set(key, { name: operation.name, value: "", remove: true });
		} else {
			values.set(key, {
				name: operation.name,
				value: operation.value,
				variable: operation.value_mode === "variable",
			});
		}
	}
	return [...values.values()]
		.sort((left, right) => left.name.toLowerCase().localeCompare(right.name.toLowerCase()))
		.map(
			(item) =>
				`proxy_set_header ${item.name} ${item.remove ? '""' : item.variable ? item.value : quote(item.value)};`,
		)
		.join("\n");
};

const renderOptions = (options = {}, websocket = false, useProxyIncludeDefaults = false) => {
	const lines = [`# npm:managed proxy-option-profile=${PROXY_OPTION_PROFILE_VERSION}`];
	for (const field of [
		"client_max_body_size",
		"proxy_connect_timeout",
		"proxy_send_timeout",
		"proxy_read_timeout",
		"proxy_next_upstream_timeout",
		"proxy_buffer_size",
		"proxy_busy_buffers_size",
		"proxy_max_temp_file_size",
		"proxy_temp_file_write_size",
		"proxy_limit_rate",
		"proxy_headers_hash_bucket_size",
		"proxy_headers_hash_max_size",
		"proxy_next_upstream_tries",
		"proxy_ssl_verify_depth",
	]) {
		if (typeof options[field] !== "undefined") lines.push(`${field} ${options[field]};`);
	}
	for (const field of [
		"proxy_buffering",
		"proxy_request_buffering",
		"proxy_ignore_client_abort",
		"proxy_intercept_errors",
		"proxy_force_ranges",
		"proxy_pass_request_body",
		"proxy_pass_request_headers",
		"proxy_pass_trailers",
		"proxy_socket_keepalive",
		"proxy_ssl_server_name",
		"proxy_ssl_session_reuse",
		"proxy_ssl_verify",
	]) {
		if (typeof options[field] !== "undefined") lines.push(`${field} ${directiveBoolean(options[field])};`);
	}
	if (options.proxy_buffers) lines.push(`proxy_buffers ${options.proxy_buffers[0]} ${options.proxy_buffers[1]};`);
	if (options.proxy_http_version) lines.push(`proxy_http_version ${options.proxy_http_version};`);
	if (options.proxy_method) lines.push(`proxy_method ${options.proxy_method};`);
	if (options.proxy_bind) lines.push(`proxy_bind ${options.proxy_bind};`);
	if (options.proxy_next_upstream) lines.push(`proxy_next_upstream ${options.proxy_next_upstream.join(" ")};`);
	if (options.proxy_ssl_name) lines.push(`proxy_ssl_name ${options.proxy_ssl_name};`);
	if (options.proxy_ssl_protocols) lines.push(`proxy_ssl_protocols ${options.proxy_ssl_protocols.join(" ")};`);
	if (options.proxy_ssl_ciphers) lines.push(`proxy_ssl_ciphers ${options.proxy_ssl_ciphers};`);
	if (options.proxy_ssl_verify) lines.push("proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;");
	if (options.proxy_cookie_domain?.length) {
		for (const item of options.proxy_cookie_domain) lines.push(`proxy_cookie_domain ${item.from} ${item.to};`);
	} else {
		lines.push("proxy_cookie_domain off;");
	}
	if (options.proxy_cookie_path?.length) {
		for (const item of options.proxy_cookie_path) lines.push(`proxy_cookie_path ${item.from} ${item.to};`);
	} else {
		lines.push("proxy_cookie_path off;");
	}
	const requestHeaders = renderRequestHeaders(options, websocket, useProxyIncludeDefaults);
	if (requestHeaders) lines.push(requestHeaders);
	const hiddenResponseHeaders = new Set();
	for (const item of options.response_headers || []) {
		const key = item.name.toLowerCase();
		if (item.operation === "set" || item.operation === "remove") {
			lines.push(`proxy_hide_header ${item.name};`);
			hiddenResponseHeaders.add(key);
		}
		if (item.operation === "set" || item.operation === "add")
			lines.push(
				`add_header ${item.name} ${item.value_mode === "variable" ? item.value : quote(item.value)} always;`,
			);
	}
	for (const header of options.hide_response_headers || []) {
		if (!hiddenResponseHeaders.has(header.toLowerCase())) lines.push(`proxy_hide_header ${header};`);
	}
	for (const header of options.proxy_pass_headers || []) lines.push(`proxy_pass_header ${header};`);
	if (options.proxy_ignore_headers?.length)
		lines.push(`proxy_ignore_headers ${options.proxy_ignore_headers.join(" ")};`);
	return lines.join("\n");
};

const renderPostPassOptions = (options = {}) =>
	options.proxy_redirect ? `proxy_redirect ${options.proxy_redirect};` : "";

const proxyTargetAuthority = (target, dependencies = {}) => {
	if (target.type === "direct") return `${target.host}:${target.port}`;
	const upstream = dependencies[String(target.upstream_id)] ?? dependencies[target.upstream_id];
	if (!upstream?.nginx_key)
		throw new errs.UnprocessableConfigError(`Referenced upstream ${target.upstream_id} is unavailable`);
	return upstream.nginx_key;
};

const indentBlock = (lines, indent = "    ") => lines.map((line) => `${indent}${line}`).join("\n");

const renderAccessPolicy = (host) => {
	const accessListId = Number(host.access_list_id || 0);
	const accessList = host.access_list ?? {};
	if (accessListId <= 0) return "# npm:feature field=access_list_id source=user value=off";
	const items = Array.isArray(accessList.items) ? accessList.items : [];
	const clients = Array.isArray(accessList.clients) ? accessList.clients : [];
	const lines = ["# npm:feature field=access_list_id source=user begin"];
	if (items.length > 0) {
		lines.push('auth_basic "Authorization required";', `auth_basic_user_file /data/access/${accessListId};`);
		if (accessList.pass_auth === 0 || accessList.pass_auth === false)
			lines.push('proxy_set_header Authorization "";');
	}
	for (const client of clients) {
		if (client?.directive && client?.address) lines.push(`${client.directive} ${client.address};`);
	}
	if (clients.length > 0) lines.push("deny all;");
	lines.push(accessList.satisfy_any === 1 || accessList.satisfy_any === true ? "satisfy any;" : "satisfy all;");
	lines.push("# npm:feature field=access_list_id source=user end");
	return lines.join("\n");
};

const renderHstsPolicy = (host) => {
	if (host.certificate && Number(host.certificate_id || 0) > 0 && host.ssl_forced && host.hsts_enabled) {
		return [
			"# npm:feature field=hsts_enabled source=user begin",
			"add_header Strict-Transport-Security $hsts_header always;",
			"# npm:feature field=hsts_enabled source=user end",
		].join("\n");
	}
	return "# npm:feature field=hsts_enabled source=user value=off";
};

const renderLocation = (location, host, upstreams = {}, effectiveOptions = host.nginx_options) => {
	const options = effectiveOptions;
	const match = {
		prefix: location.path,
		priority_prefix: `^~ ${location.path}`,
		exact: `= ${location.path}`,
		regex: `~ ${quote(location.path)}`,
		regex_i: `~* ${quote(location.path)}`,
	}[location.match_type];
	const target = location.target ?? {
		type: "direct",
		scheme: location.forward_scheme,
		host: location.forward_host,
		port: location.forward_port,
	};
	const authority = proxyTargetAuthority(target, upstreams);
	const uri =
		location.path_mode === "preserve_uri"
			? ""
			: location.path_mode === "strip_prefix"
				? "/"
				: location.forward_path;
	const proxyPass = `proxy_pass ${target.scheme}://${authority}${uri};`;
	const lines = [
		`  location ${match} {`,
		"    # Keep the human log and the structured monitoring log at location scope.",
		`    access_log /data/logs/proxy-host-${host.id}_access.log proxy;`,
		"    access_log /data/logs/npm-monitor-http.log npm_proxy_metrics_v1 buffer=128k flush=1s;",
		indentBlock(renderAccessPolicy(host).split("\n")),
		indentBlock(renderHstsPolicy(host).split("\n")),
		location.advanced_config ? `    ${location.advanced_config.replace(/\n/g, "\n    ")}` : "",
		renderOptions(options, host.allow_websocket_upgrade, true)
			.split("\n")
			.map((line) => `    ${line}`)
			.join("\n"),
		"    # npm:feature field=caching_enabled source=derived begin",
		"    proxy_cache off;",
		"    proxy_cache_bypass 0;",
		"    proxy_no_cache 0;",
		"    # npm:feature field=caching_enabled source=derived end",
		"    add_header X-Served-By $host;",
		`    ${proxyPass}`,
		renderPostPassOptions(options) ? `    ${renderPostPassOptions(options)}` : "",
		"  }",
	];
	return lines.filter(Boolean).join("\n");
};


const renderAssetsLocation = (host, options, upstreams = {}) => {
	const assetOptions = {
		...options,
		proxy_connect_timeout: "5s",
		proxy_read_timeout: "45s",
		proxy_ignore_headers: ["Set-Cookie", "Cache-Control", "Expires", "X-Accel-Expires"],
		hide_response_headers: [...new Set([...(options.hide_response_headers || []), "last-modified", "cache-control", "vary"])],
	};
	const target = host.default_target;
	const authority = proxyTargetAuthority(target, upstreams);
	const proxyPass =
		target.type === "upstream"
			? `${target.scheme}://${authority}$request_uri`
			: "$forward_scheme://$server:$port$request_uri";
	return [
		"  # npm:feature field=caching_enabled source=user begin",
		"  location ~* ^.*\\.(css|js|jpe?g|gif|png|webp|woff|woff2|eot|ttf|svg|ico|css\\.map|js\\.map)$ {",
		"    if_modified_since off;",
		"    proxy_cache public-cache;",
		"    proxy_cache_key $host$request_uri;",
		"    proxy_cache_valid any 30m;",
		"    proxy_cache_valid 404 1m;",
		"    proxy_cache_bypass 0;",
		"    proxy_no_cache 0;",
		"    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504 http_404;",
		"    expires @30m;",
		"    # Keep cache hits visible in both the human and structured monitoring logs.",
		`    access_log /data/logs/proxy-host-${host.id}_access.log proxy;`,
		"    access_log /data/logs/npm-monitor-http.log npm_proxy_metrics_v1 buffer=128k flush=1s;",
		indentBlock(renderAccessPolicy(host).split("\n")),
		indentBlock(renderHstsPolicy(host).split("\n")),
		renderOptions(assetOptions, host.allow_websocket_upgrade, true)
			.split("\n")
			.map((line) => `    ${line}`)
			.join("\n"),
		"    add_header X-Served-By $host;",
		`    proxy_pass ${proxyPass};`,
		renderPostPassOptions(assetOptions) ? `    ${renderPostPassOptions(assetOptions)}` : "",
		"  }",
		"  # npm:feature field=caching_enabled source=user end",
	].filter(Boolean).join("\n");
};



const UPSTREAM_KEY = /^[a-z][a-z0-9_-]{0,62}$/;
const UPSTREAM_DURATION = /^(?:0|[1-9]\d*)(?:ms|s|m|h|d|w|M|y)?$/;
const UPSTREAM_METHODS = new Set(["round_robin", "least_conn", "ip_hash", "random"]);
const UPSTREAM_ZONE_SIZE = /^[1-9]\d*(?:[kKmMgG])?$/;

export const normalizeUpstreamServerHost = (value) => {
	const rawHost = String(value ?? "").trim();
	const host = /^\[([^\]]+)\]$/.exec(rawHost)?.[1] ?? rawHost;
	if (isIP(host)) return host;
	const labels = host.split(".");
	const validHostname =
		host.length <= 253 &&
		labels.length > 0 &&
		labels.every((label) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
	if (!validHostname) throw new errs.UnprocessableConfigError("Invalid upstream server host");
	return host.toLowerCase();
};

const formatUpstreamAddress = (host, port) => {
	const normalizedHost = normalizeUpstreamServerHost(host);
	const numericPort = Number(port);
	if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535)
		throw new errs.UnprocessableConfigError("Invalid upstream server port");
	const authority = isIP(normalizedHost) === 6 ? `[${normalizedHost}]` : normalizedHost;
	return `${authority}:${numericPort}`;
};

const renderUpstreamServer = (server) => {
	const address = formatUpstreamAddress(server.host, server.port);
	const weight = Number(server.weight ?? 1);
	const maxFails = Number(server.max_fails ?? 1);
	const maxConns = server.max_conns === null || typeof server.max_conns === "undefined" ? null : Number(server.max_conns);
	const failTimeout = String(server.fail_timeout ?? "10s");
	if (!Number.isInteger(weight) || weight < 0 || weight > 65535)
		throw new errs.UnprocessableConfigError("Invalid upstream server weight");
	if (!Number.isInteger(maxFails) || maxFails < 0 || maxFails > 65535)
		throw new errs.UnprocessableConfigError("Invalid upstream server max_fails");
	if (!UPSTREAM_DURATION.test(failTimeout)) throw new errs.UnprocessableConfigError("Invalid upstream server fail_timeout");
	if (maxConns !== null && (!Number.isInteger(maxConns) || maxConns < 1 || maxConns > 65535))
		throw new errs.UnprocessableConfigError("Invalid upstream server max_conns");
	const parameters = [`weight=${weight}`, `max_fails=${maxFails}`, `fail_timeout=${failTimeout}`];
	if (maxConns !== null) parameters.push(`max_conns=${maxConns}`);
	if (server.backup) parameters.push("backup");
	if (server.down) parameters.push("down");
	return `  server ${address} ${parameters.join(" ")};`;
};

/** Render a global http-context upstream block. User controlled values are
 * validated before being added to a directive, so the result cannot inject
 * arbitrary nginx configuration. */
export const buildUpstreamCandidate = async ({ upstream }) => {
	const value = structuredClone(upstream ?? {});
	const nginxKey = String(value.nginx_key ?? "").trim().toLowerCase();
	const method = String(value.load_balancing_method ?? "round_robin");
	const zoneSize = String(value.zone_size ?? "64k").toLowerCase();
	if (!UPSTREAM_KEY.test(nginxKey)) throw new errs.UnprocessableConfigError("Invalid upstream nginx_key");
	if (!UPSTREAM_METHODS.has(method)) throw new errs.UnprocessableConfigError("Invalid upstream load balancing method");
	if (!UPSTREAM_ZONE_SIZE.test(zoneSize)) throw new errs.UnprocessableConfigError("Invalid upstream zone_size");
	if (!Array.isArray(value.servers) || !value.servers.length)
		throw new errs.UnprocessableConfigError("An upstream requires at least one server");
	const servers = [...value.servers]
		.sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0) || Number(left.id ?? 0) - Number(right.id ?? 0))
		.map(renderUpstreamServer);
	const config = asLf([
		"# Managed by Nginx Proxy Manager. Do not edit this file manually.",
		`upstream ${nginxKey} {`,
		`  zone ${nginxKey} ${zoneSize};`,
		...(method === "round_robin" ? [] : [`  ${method};`]),
		"",
		...servers,
		"}",
	].join("\n"));
	const templateHash = await readTemplateManifest("upstream.conf");
	const payload = {
		id: value.id ?? null,
		nginx_key: nginxKey,
		load_balancing_method: method,
		zone_size: zoneSize,
		servers: value.servers.map(({ id, host, port, weight, max_fails, fail_timeout, max_conns, backup, down, sort_order }) => ({
			id: id ?? null, host, port: Number(port), weight: Number(weight ?? 1), max_fails: Number(max_fails ?? 1),
			fail_timeout: String(fail_timeout ?? "10s"), max_conns: max_conns ?? null, backup: Boolean(backup), down: Boolean(down), sort_order: Number(sort_order ?? 0),
		})),
	};
	const partial = {
		config,
		configHash: sha256(Buffer.from(config, "utf8")),
		payloadHash: hashCanonical(payload),
		dependencyHash: hashCanonical({}),
		templateVersion: TEMPLATE_VERSION,
		templateHash,
		capabilityHash: hashCanonical({}),
		diagnostics: [],
		sourceMap: [],
	};
	return Object.freeze({ ...partial, snapshot: buildSnapshot("upstream", value, partial) });
};

// API validation may coerce an optional foreign key such as certificate_id
// between its numeric and string representation. The resolved dependency is
// semantically the same, so its preview hash must be representation-independent.
const canonicalDependencyId = (value) => {
	if (value === null || typeof value === "undefined") return null;
	if (value === "new") return value;
	const numeric = Number(value);
	return Number.isSafeInteger(numeric) ? numeric : value;
};

/**
 * Objection relation rows are Model instances rather than plain objects. Keep
 * those persistence objects out of the canonical hash boundary and retain only
 * fields that can change the rendered access policy or its credential file.
 * Passwords are represented by a one-way fingerprint and never copied into the
 * render context or returned preview data.
 */
const normalizeAccessListDependency = (host, accessList) => {
	if (!accessList || Number(host.access_list_id || 0) <= 0) return null;
	return {
		id: canonicalDependencyId(accessList.id ?? host.access_list_id),
		clients: (accessList.clients ?? []).map((client) => ({
			directive: String(client?.directive ?? ""),
			address: String(client?.address ?? ""),
		})),
		items: (accessList.items ?? []).map((item) => ({
			username: String(item?.username ?? ""),
			credential_hash:
				item?.credential_hash ?? sha256(Buffer.from(String(item?.password ?? ""), "utf8")),
		})),
		pass_auth: Boolean(accessList.pass_auth ?? true),
		satisfy_any: Boolean(accessList.satisfy_any ?? false),
	};
};

const buildDependencyManifest = (host, dependencies) => ({
	certificate: dependencies.certificate
		? {
				id: canonicalDependencyId(dependencies.certificate.id ?? host.certificate_id),
				provider: dependencies.certificate.provider ?? null,
				fullchain_hash: dependencies.certificate.fullchain_hash ?? null,
				key_hash: dependencies.certificate.key_hash ?? null,
			}
		: { id: canonicalDependencyId(host.certificate_id) },
	access_list: dependencies.access_list
		? {
				id: canonicalDependencyId(dependencies.access_list.id ?? host.access_list_id),
				clients: dependencies.access_list.clients ?? [],
				items: dependencies.access_list.items ?? [],
				pass_auth: Boolean(dependencies.access_list.pass_auth ?? true),
				satisfy_any: Boolean(dependencies.access_list.satisfy_any ?? false),
			}
		: { id: canonicalDependencyId(host.access_list_id) },
	includes: dependencies.includes ?? [],
	upstreams: Object.values(dependencies.upstreams ?? {})
		.map((upstream) => ({
			id: canonicalDependencyId(upstream.id),
			nginx_key: upstream.nginx_key,
			applied_revision: upstream.nginx_applied_revision ?? null,
			applied_hash: upstream.nginx_applied_hash ?? null,
		}))
		.sort((left, right) => Number(left.id) - Number(right.id)),
});

/**
 * Pure renderer. It reads immutable template files but never reads or writes an
 * active nginx artifact, DB record, or deployment state.
 */
export const buildProxyHostCandidate = async ({ host, dependencies = {}, capability = {} }) => {
	const normalized = normalizeProxyHost(host);
	const accessList = normalizeAccessListDependency(
		normalized,
		dependencies.access_list ?? normalized.access_list,
	);
	const normalizedDependencies = { ...dependencies, access_list: accessList };
	const { capability: effectiveCapability, diagnostics: capabilityDiagnostics } = validateNginxCapability(capability);
	const effectiveConfig = resolveEffectiveProxyConfig(normalized);
	const diagnostics = [
		...capabilityDiagnostics,
		...(normalizedDependencies.includes ?? []).flatMap((entry) => entry.diagnostics ?? []),
		...scanAdvancedConfig(normalized.advanced_config),
		...normalized.locations.flatMap((location) => [
			...location._normalization_warnings,
			...scanAdvancedConfig(location.advanced_config).map((item) => ({
				...item,
				scope: "location",
				path: location.path,
			})),
		]),
	];
	if (hasDiagnosticErrors(diagnostics))
		throw new errs.UnprocessableConfigError("Advanced nginx config conflicts with managed configuration", {
			diagnostics,
		});
	const templateHash = await readTemplateManifest("proxy_host.conf");
	const dependencyManifest = buildDependencyManifest(normalized, normalizedDependencies);
	const dependencyHash = hashCanonical(dependencyManifest);
	const capabilityHash = hashCanonical(effectiveCapability);
	const payload = {
		id: normalized.id ?? null,
		enabled: Boolean(normalized.enabled),
		domain_names: normalized.domain_names ?? [],
		forward_scheme: normalized.forward_scheme,
		forward_host: normalized.forward_host,
		forward_port: normalized.forward_port,
		default_target: normalized.default_target,
		locations: normalized.locations.map(({ _normalization_warnings, ...location }) => location),
		advanced_config: normalized.advanced_config ?? "",
		nginx_config: normalized.nginx_config,
		proxy_option_profile_version: PROXY_OPTION_PROFILE_VERSION,
		ssl_forced: Boolean(normalized.ssl_forced),
		caching_enabled: Boolean(normalized.caching_enabled),
		block_exploits: Boolean(normalized.block_exploits),
		allow_websocket_upgrade: Boolean(normalized.allow_websocket_upgrade),
		http2_support: Boolean(normalized.http2_support),
		hsts_enabled: Boolean(normalized.hsts_enabled),
		hsts_subdomains: Boolean(normalized.hsts_subdomains),
		trust_forwarded_proto: Boolean(normalized.trust_forwarded_proto),
		dependencies: dependencyManifest,
	};
	const payloadHash = hashCanonical(payload);
	const renderEngine = utils.getRenderEngine();
	const template = await fs.readFile(join(templatesDir, "proxy_host.conf"), "utf8");
	const defaultLocationEnabled = normalized.nginx_options.default_location_enabled !== false;
	const useDefaultLocation =
		defaultLocationEnabled &&
		!normalized.locations.some((location) => location.path === "/" && location.match_type === "prefix") &&
		!/^(?:.*;)?\s*?location\s*?\/\s*?{/im.test(normalized.advanced_config || "");
	if (useDefaultLocation && normalized.nginx_options.proxy_redirect === "default")
		throw new errs.UnprocessableConfigError(
			"proxy_redirect default cannot be used in the managed default Location because proxy_pass contains variables; choose off or define a literal custom root Location",
			{
				code: "PROXY_REDIRECT_DEFAULT_WITH_VARIABLE_PROXY_PASS",
				field: "nginx_config.server.proxy_redirect",
			},
		);
	const renderHost = {
		...normalized,
		certificate: normalizedDependencies.certificate ?? normalized.certificate,
		access_list: accessList,
	};
	const renderContext = {
		...renderHost,
		ipv6: effectiveCapability.ipv6,
		use_default_location: useDefaultLocation,
		locations: normalized.locations.map((location, index) => renderLocation(location, renderHost, normalizedDependencies.upstreams ?? {}, effectiveConfig.locations[index].effective_flat)).join("\n\n"),
		managed_assets_location: normalized.caching_enabled
			? renderAssetsLocation(renderHost, effectiveConfig.server.effective_flat, normalizedDependencies.upstreams ?? {})
			: "  # npm:feature field=caching_enabled source=user value=off",
		default_proxy_pass:
			normalized.default_target.type === "upstream"
				? `${normalized.default_target.scheme}://${proxyTargetAuthority(normalized.default_target, normalizedDependencies.upstreams ?? {})}$request_uri`
				: "$forward_scheme://$server:$port$request_uri",
		managed_nginx_location_options: renderOptions(
			normalized.nginx_options,
			normalized.allow_websocket_upgrade,
			true,
		),
		managed_nginx_location_post_pass_options: renderPostPassOptions(normalized.nginx_options),
	};
	const rendered = await renderEngine.parseAndRender(template, renderContext);
	const config = asLf(
		normalized.nginx_listener.mode === "port"
			? renderPortOnlyListener(rendered, normalized.nginx_listener, renderContext.ipv6)
			: rendered,
	);
	const configHash = sha256(Buffer.from(config, "utf8"));
	const sourceMap = buildProxySourceMap(config, effectiveConfig);
	const partial = {
		config,
		configHash,
		payloadHash,
		dependencyHash,
		templateVersion: TEMPLATE_VERSION,
		templateHash,
		capabilityHash,
		capability: effectiveCapability,
		diagnostics,
		effectiveConfig,
		sourceMap,
	};
	return Object.freeze({ ...partial, snapshot: buildSnapshot("proxy_host", normalized, partial) });
};

export const buildCandidate = async ({ hostType, host, ...input }) => {
	const adapter = getHostAdapter(hostType);
	if (hostType === "proxy_host") return buildProxyHostCandidate({ host, ...input });
	if (hostType === "upstream") return buildUpstreamCandidate({ upstream: host });
	const template = await fs.readFile(join(templatesDir, adapter.template), "utf8");
	const engine = utils.getRenderEngine();
	const config = asLf(await engine.parseAndRender(template, structuredClone(host)));
	const partial = {
		config,
		configHash: sha256(Buffer.from(config)),
		payloadHash: hashCanonical(host),
		dependencyHash: hashCanonical(input.dependencies ?? {}),
		templateVersion: TEMPLATE_VERSION,
		templateHash: await readTemplateManifest(adapter.template),
		capabilityHash: hashCanonical(input.capability ?? {}),
		diagnostics: [],
		sourceMap: [],
	};
	return Object.freeze({ ...partial, snapshot: buildSnapshot(hostType, host, partial) });
};

export default { buildCandidate, buildProxyHostCandidate, buildUpstreamCandidate };
