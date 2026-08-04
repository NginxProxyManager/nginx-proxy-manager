import fs from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { hasDiagnosticErrors, scanAdvancedConfig } from "./nginx-config-diagnostics.js";
import { hashCanonical, hashFileManifest, sha256 } from "./nginx-config-hash.js";
import { normalizeProxyHost } from "./nginx-config-normalizer.js";
import { buildSnapshot, getHostAdapter } from "./nginx-host-adapters.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(__dirname, "../templates");
const TEMPLATE_VERSION = "nginx-config-renderer-v2";
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
	const lines = [];
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
	if (options.proxy_redirect) lines.push(`proxy_redirect ${options.proxy_redirect};`);
	if (options.proxy_ssl_name) lines.push(`proxy_ssl_name ${options.proxy_ssl_name};`);
	if (options.proxy_ssl_protocols) lines.push(`proxy_ssl_protocols ${options.proxy_ssl_protocols.join(" ")};`);
	if (options.proxy_ssl_ciphers) lines.push(`proxy_ssl_ciphers ${options.proxy_ssl_ciphers};`);
	if (options.proxy_ssl_verify) lines.push("proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;");
	for (const item of options.proxy_cookie_domain || []) lines.push(`proxy_cookie_domain ${item.from} ${item.to};`);
	for (const item of options.proxy_cookie_path || []) lines.push(`proxy_cookie_path ${item.from} ${item.to};`);
	const requestHeaders = renderRequestHeaders(options, websocket, useProxyIncludeDefaults);
	if (requestHeaders) lines.push(requestHeaders);
	for (const item of options.response_headers || []) {
		if (item.operation === "remove") continue;
		if (item.operation === "add" || item.operation === "set")
			lines.push(
				`add_header ${item.name} ${item.value_mode === "variable" ? item.value : quote(item.value)} always;`,
			);
	}
	for (const header of options.hide_response_headers || []) lines.push(`proxy_hide_header ${header};`);
	for (const header of options.proxy_pass_headers || []) lines.push(`proxy_pass_header ${header};`);
	if (options.proxy_ignore_headers?.length)
		lines.push(`proxy_ignore_headers ${options.proxy_ignore_headers.join(" ")};`);
	return lines.join("\n");
};

const proxyTargetAuthority = (target, dependencies = {}) => {
	if (target.type === "direct") return `${target.host}:${target.port}`;
	const upstream = dependencies[String(target.upstream_id)] ?? dependencies[target.upstream_id];
	if (!upstream?.nginx_key)
		throw new errs.UnprocessableConfigError(`Referenced upstream ${target.upstream_id} is unavailable`);
	return upstream.nginx_key;
};

const renderLocation = (location, host, upstreams = {}) => {
	const options = { ...host.nginx_options, ...location.nginx_config };
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
		location.advanced_config ? `    ${location.advanced_config.replace(/\n/g, "\n    ")}` : "",
		renderOptions(options, host.allow_websocket_upgrade, true)
			.split("\n")
			.map((line) => `    ${line}`)
			.join("\n"),
		"    add_header X-Served-By $host;",
		`    ${proxyPass}`,
		"  }",
	];
	return lines.filter(Boolean).join("\n");
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

const buildDependencyManifest = (host, dependencies) => ({
	certificate: dependencies.certificate
		? {
				id: canonicalDependencyId(dependencies.certificate.id ?? host.certificate_id),
				fullchain_hash: dependencies.certificate.fullchain_hash ?? null,
				key_hash: dependencies.certificate.key_hash ?? null,
			}
		: { id: canonicalDependencyId(host.certificate_id) },
	access_list: dependencies.access_list
		? {
				id: canonicalDependencyId(dependencies.access_list.id ?? host.access_list_id),
				clients: dependencies.access_list.clients ?? [],
				items: dependencies.access_list.items ?? [],
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
	const diagnostics = [
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
	const dependencyManifest = buildDependencyManifest(normalized, dependencies);
	const dependencyHash = hashCanonical(dependencyManifest);
	const capabilityHash = hashCanonical(capability);
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
	const renderContext = {
		...normalized,
		certificate: dependencies.certificate ?? normalized.certificate,
		access_list: dependencies.access_list ?? normalized.access_list,
		ipv6: typeof capability.ipv6 === "boolean" ? capability.ipv6 : true,
		use_default_location: useDefaultLocation,
		locations: normalized.locations.map((location) => renderLocation(location, normalized, dependencies.upstreams ?? {})).join("\n\n"),
		default_target_type: normalized.default_target.type,
		default_proxy_pass:
			normalized.default_target.type === "upstream"
				? `${normalized.default_target.scheme}://${proxyTargetAuthority(normalized.default_target, dependencies.upstreams ?? {})}$request_uri`
				: null,
		nginx_options: renderOptions(normalized.nginx_options, normalized.allow_websocket_upgrade),
		managed_nginx_location_options: renderOptions(
			normalized.nginx_options,
			normalized.allow_websocket_upgrade,
			true,
		),
		// proxy.conf carries its own proxy_set_header defaults. When a user manages
		// request headers, render proxy_pass directly so the upstream receives one
		// authoritative value per header rather than duplicate Host headers.
		use_managed_request_headers: Boolean(normalized.nginx_options.request_headers?.length),
	};
	const rendered = await renderEngine.parseAndRender(template, renderContext);
	const config = asLf(
		normalized.nginx_listener.mode === "port"
			? renderPortOnlyListener(rendered, normalized.nginx_listener, renderContext.ipv6)
			: rendered,
	);
	const configHash = sha256(Buffer.from(config, "utf8"));
	const partial = {
		config,
		configHash,
		payloadHash,
		dependencyHash,
		templateVersion: TEMPLATE_VERSION,
		templateHash,
		capabilityHash,
		diagnostics,
		sourceMap: [],
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
