import assert from "node:assert/strict";
import test from "node:test";
import { scanAdvancedConfig } from "../../internal/nginx-config-diagnostics.js";
import { canonicalize, hashCanonical } from "../../internal/nginx-config-hash.js";
import { normalizeLocation, normalizeProxyHost } from "../../internal/nginx-config-normalizer.js";
import { buildProxyHostCandidate } from "../../internal/nginx-config-renderer.js";

test("HASH-001 canonical JSON sorts object keys but retains array order", () => {
	assert.equal(canonicalize({ z: [2, 1], a: { y: true, x: null } }), '{"a":{"x":null,"y":true},"z":[2,1]}');
	assert.equal(hashCanonical({ b: 1, a: 2 }), hashCanonical({ a: 2, b: 1 }));
	assert.notEqual(hashCanonical([1, 2]), hashCanonical([2, 1]));
	assert.throws(() => canonicalize({ value: undefined }), /undefined/);
});

test("PREVIEW-003 dependency hashing is stable across API foreign-key coercion", async () => {
	const host = {
		id: 42,
		enabled: true,
		domain_names: ["hash.example.com"],
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: 8080,
		access_list_id: 0,
		certificate_id: 0,
		locations: [],
		nginx_config: { schema_version: 1, server: {} },
	};
	const preview = await buildProxyHostCandidate({ host });
	const save = await buildProxyHostCandidate({ host: { ...host, certificate_id: "0" } });
	assert.equal(save.dependencyHash, preview.dependencyHash);
	assert.equal(save.payloadHash, preview.payloadHash);
});

test("LOC truth table validates match/path combinations", () => {
	assert.equal(
		normalizeLocation({
			path: "/api/",
			forward_scheme: "http",
			forward_host: "example.com",
			forward_port: 80,
			match_type: "prefix",
			path_mode: "strip_prefix",
		}).path_mode,
		"strip_prefix",
	);
	assert.throws(
		() =>
			normalizeLocation({
				path: "/api",
				forward_scheme: "http",
				forward_host: "example.com",
				forward_port: 80,
				match_type: "prefix",
				path_mode: "strip_prefix",
			}),
		/slash-terminated/,
	);
	assert.throws(
		() =>
			normalizeLocation({
				path: "/a",
				forward_scheme: "http",
				forward_host: "example.com",
				forward_port: 80,
				match_type: "exact",
				path_mode: "replace_prefix",
				forward_path: "/",
			}),
		/only support preserve_uri/,
	);
	assert.equal(
		normalizeLocation({
			path: "^/a",
			forward_scheme: "http",
			forward_host: "example.com",
			forward_port: 80,
			match_type: "regex",
			path_mode: "preserve_uri",
		}).match_type,
		"regex",
	);
});

test("HDR duplicate and protected headers are rejected", () => {
	assert.throws(
		() =>
			normalizeProxyHost({
				domain_names: ["headers.example.com"],
				nginx_config: {
					schema_version: 1,
					server: {
						request_headers: [
							{ name: "X-Test", value: "a" },
							{ name: "x-test", value: "b" },
						],
					},
				},
			}),
		/duplicate/,
	);
	assert.throws(
		() =>
			normalizeProxyHost({
				domain_names: ["headers.example.com"],
				nginx_config: {
					schema_version: 1,
					server: { request_headers: [{ name: "Host", operation: "remove" }] },
				},
			}),
		/managed by the system/,
	);
});

test("HDR-001 managed Host override emits a single upstream Host header", async () => {
	const candidate = await buildProxyHostCandidate({
		host: {
			id: 24,
			enabled: true,
			domain_names: ["headers.example.com"],
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: 8080,
			locations: [],
			nginx_config: {
				schema_version: 1,
				server: {
					request_headers: [{ name: "Host", operation: "set", value: "localhost" }],
				},
			},
		},
	});

	const defaultLocation = candidate.config.match(/location \/ \{([\s\S]*?)\n {2}\}/)?.[1] ?? "";
	assert.doesNotMatch(defaultLocation, /include conf\.d\/include\/proxy\.conf;/);
	assert.match(defaultLocation, /proxy_pass \$forward_scheme:\/\/\$server:\$port\$request_uri;/);
	assert.equal((defaultLocation.match(/proxy_set_header Host /g) ?? []).length, 1);
	assert.match(defaultLocation, /proxy_set_header Host "localhost";/);
});

test("OPT-001 all structured proxy options normalize and render with nginx-compatible durations", async () => {
	const host = {
		id: 14,
		enabled: true,
		domain_names: ["all-options.example.com"],
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: 8080,
		access_list_id: 0,
		certificate_id: 0,
		ssl_forced: false,
		caching_enabled: false,
		block_exploits: false,
		allow_websocket_upgrade: true,
		http2_support: false,
		hsts_enabled: false,
		hsts_subdomains: false,
		trust_forwarded_proto: false,
		advanced_config: "",
		locations: [
			{
				path: "/api/",
				forward_scheme: "https",
				forward_host: "api.example.com",
				forward_port: 8443,
				match_type: "priority_prefix",
				path_mode: "replace_prefix",
				forward_path: "/v1/",
				nginx_config: {
					proxy_connect_timeout: "10s",
					proxy_buffering: false,
					proxy_request_buffering: false,
					proxy_ssl_server_name: false,
				},
			},
		],
		nginx_config: {
			schema_version: 1,
			server: {
				default_location_enabled: true,
				proxy_connect_timeout: "60",
				proxy_send_timeout: "2m",
				proxy_read_timeout: "500ms",
				client_max_body_size: "64m",
				proxy_buffer_size: "8k",
				proxy_busy_buffers_size: "32k",
				proxy_buffers: [8, "16k"],
				proxy_buffering: true,
				proxy_request_buffering: true,
				proxy_ssl_server_name: true,
				request_headers: [
					{ name: "X-Request-Id", operation: "set", value_mode: "variable", value: "$request_id" },
					{ name: "X-Debug", operation: "add", value: "enabled" },
					{ name: "X-Remove-Me", operation: "remove" },
				],
				response_headers: [
					{ name: "X-Frame-Options", operation: "set", value: "DENY" },
					{ name: "X-Trace", operation: "add", value_mode: "variable", value: "$request_id" },
				],
				hide_response_headers: ["X-Powered-By", "X-AspNet-Version"],
			},
		},
	};

	const normalized = normalizeProxyHost(host);
	assert.equal(normalized.nginx_options.proxy_connect_timeout, "60");
	assert.equal(normalized.locations[0].nginx_config.proxy_connect_timeout, "10s");
	assert.throws(
		() =>
			normalizeProxyHost({
				...host,
				nginx_config: { schema_version: 1, server: { proxy_connect_timeout: "1.5s" } },
			}),
		/whole nginx duration/,
	);

	const candidate = await buildProxyHostCandidate({ host });
	const inheritedLocationCandidate = await buildProxyHostCandidate({
		host: {
			...host,
			locations: [{ ...host.locations[0], nginx_config: {} }],
		},
	});
	assert.match(
		inheritedLocationCandidate.config,
		/location \^~ \/api\/ \{[\s\S]*?proxy_connect_timeout 60;[\s\S]*?proxy_buffering on;/,
	);

	for (const directive of [
		"client_max_body_size 64m;",
		"proxy_connect_timeout 60;",
		"proxy_send_timeout 2m;",
		"proxy_read_timeout 500ms;",
		"proxy_buffer_size 8k;",
		"proxy_busy_buffers_size 32k;",
		"proxy_buffers 8 16k;",
		"proxy_buffering on;",
		"proxy_request_buffering on;",
		"proxy_ssl_server_name on;",
		'proxy_set_header X-Debug "enabled";',
		"proxy_set_header X-Request-Id $request_id;",
		'proxy_set_header X-Remove-Me "";',
		'add_header X-Frame-Options "DENY" always;',
		"add_header X-Trace $request_id always;",
		"proxy_hide_header x-aspnet-version;",
		"proxy_hide_header x-powered-by;",
		"proxy_connect_timeout 10s;",
		"proxy_buffering off;",
		"proxy_request_buffering off;",
		"proxy_ssl_server_name off;",
	]) {
		assert.match(candidate.config, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	}
});

test("OPT-002 expanded proxy module controls normalize and render", async () => {
	const host = {
		id: 15,
		enabled: true,
		domain_names: ["proxy-module.example.com"],
		forward_scheme: "https",
		forward_host: "origin.example.com",
		forward_port: 443,
		access_list_id: 0,
		certificate_id: 0,
		ssl_forced: false,
		caching_enabled: false,
		block_exploits: false,
		allow_websocket_upgrade: false,
		http2_support: false,
		hsts_enabled: false,
		hsts_subdomains: false,
		trust_forwarded_proto: false,
		advanced_config: "",
		locations: [],
		nginx_config: {
			schema_version: 1,
			server: {
				proxy_http_version: "1.1",
				proxy_method: "POST",
				proxy_pass_request_headers: false,
				proxy_pass_request_body: false,
				proxy_pass_trailers: true,
				proxy_ignore_client_abort: true,
				proxy_socket_keepalive: true,
				proxy_bind: "192.0.2.10",
				proxy_next_upstream: ["error", "timeout", "http_502", "http_429", "non_idempotent"],
				proxy_next_upstream_timeout: "15s",
				proxy_next_upstream_tries: 3,
				proxy_max_temp_file_size: "256m",
				proxy_temp_file_write_size: "32k",
				proxy_limit_rate: "128k",
				proxy_headers_hash_bucket_size: 64,
				proxy_headers_hash_max_size: 512,
				proxy_intercept_errors: true,
				proxy_force_ranges: true,
				proxy_redirect: "off",
				proxy_cookie_domain: [{ from: "origin.example.com", to: "public.example.com" }],
				proxy_cookie_path: [{ from: "/app", to: "/" }],
				proxy_pass_headers: ["Date", "Server"],
				proxy_ignore_headers: ["X-Accel-Redirect", "Set-Cookie"],
				proxy_ssl_server_name: true,
				proxy_ssl_name: "origin.example.com",
				proxy_ssl_verify: true,
				proxy_ssl_verify_depth: 2,
				proxy_ssl_session_reuse: false,
				proxy_ssl_protocols: ["TLSv1.2", "TLSv1.3"],
				proxy_ssl_ciphers: "HIGH:!aNULL",
			},
		},
	};

	const candidate = await buildProxyHostCandidate({ host });
	for (const directive of [
		"proxy_http_version 1.1;",
		"proxy_method POST;",
		"proxy_pass_request_headers off;",
		"proxy_pass_request_body off;",
		"proxy_pass_trailers on;",
		"proxy_ignore_client_abort on;",
		"proxy_socket_keepalive on;",
		"proxy_bind 192.0.2.10;",
		"proxy_next_upstream error timeout http_502 http_429 non_idempotent;",
		"proxy_next_upstream_timeout 15s;",
		"proxy_next_upstream_tries 3;",
		"proxy_max_temp_file_size 256m;",
		"proxy_temp_file_write_size 32k;",
		"proxy_limit_rate 128k;",
		"proxy_headers_hash_bucket_size 64;",
		"proxy_headers_hash_max_size 512;",
		"proxy_intercept_errors on;",
		"proxy_force_ranges on;",
		"proxy_redirect off;",
		"proxy_cookie_domain origin.example.com public.example.com;",
		"proxy_cookie_path /app /;",
		"proxy_pass_header Date;",
		"proxy_pass_header Server;",
		"proxy_ignore_headers X-Accel-Redirect Set-Cookie;",
		"proxy_ssl_name origin.example.com;",
		"proxy_ssl_server_name on;",
		"proxy_ssl_verify on;",
		"proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;",
		"proxy_ssl_verify_depth 2;",
		"proxy_ssl_session_reuse off;",
		"proxy_ssl_protocols TLSv1.2 TLSv1.3;",
		"proxy_ssl_ciphers HIGH:!aNULL;",
	]) {
		assert.match(candidate.config, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	}
	assert.throws(
		() =>
			normalizeProxyHost({
				...host,
				nginx_config: { schema_version: 1, server: { proxy_next_upstream: ["off", "timeout"] } },
			}),
		/only off/,
	);
	assert.throws(
		() => normalizeProxyHost({ ...host, nginx_config: { schema_version: 1, server: { proxy_bind: "not an ip" } } }),
		/IP address/,
	);
	assert.throws(
		() =>
			normalizeProxyHost({
				...host,
				nginx_config: { schema_version: 1, server: { proxy_headers_hash_bucket_size: 0 } },
			}),
		/at least 1/,
	);
});
test("ADV lexer ignores comments and strings but diagnoses managed directives", () => {
	assert.equal(
		scanAdvancedConfig('# proxy_pass http://ignored;\nset $x "location / {";').filter(
			(item) => item.severity === "error",
		).length,
		0,
	);
	assert.equal(scanAdvancedConfig("proxy_pass http://example.com;").at(0).code, "ADVANCED_MANAGED_DIRECTIVE");
	const accessLogDiagnostic = scanAdvancedConfig("access_log off;").at(0);
	assert.equal(accessLogDiagnostic.code, "ADVANCED_MANAGED_DIRECTIVE");
	assert.match(accessLogDiagnostic.message, /monitoring logs/);
	for (const directive of [
		"proxy_http_version 1.1;",
		"proxy_pass_request_body off;",
		"proxy_buffer_size 8k;",
		"proxy_redirect off;",
		"proxy_cookie_domain backend.example public.example;",
		"proxy_ssl_verify on;",
	]) {
		const diagnostic = scanAdvancedConfig(directive).at(0);
		assert.equal(diagnostic.code, "ADVANCED_STRUCTURED_CONFLICT", directive);
		assert.equal(diagnostic.severity, "warning", directive);
	}
});

test("REN-001/002 renderer is immutable and deterministic", async () => {
	const host = {
		id: 12,
		enabled: true,
		domain_names: ["example.com"],
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: 3000,
		access_list_id: 0,
		certificate_id: 0,
		ssl_forced: false,
		caching_enabled: false,
		block_exploits: true,
		allow_websocket_upgrade: false,
		http2_support: false,
		hsts_enabled: false,
		hsts_subdomains: false,
		trust_forwarded_proto: false,
		advanced_config: "",
		locations: [
			{
				path: "/api/",
				forward_scheme: "http",
				forward_host: "example.com",
				forward_port: 8080,
				match_type: "priority_prefix",
				path_mode: "replace_prefix",
				forward_path: "/v1/",
			},
		],
		nginx_config: { schema_version: 1, server: { proxy_read_timeout: "30s" } },
	};
	const before = structuredClone(host);
	const first = await buildProxyHostCandidate({ host });
	const second = await buildProxyHostCandidate({ host });
	assert.deepEqual(host, before);
	assert.equal(first.config, second.config);
	assert.equal(first.configHash, second.configHash);
	assert.match(first.config, /location \^~ \/api\//);
	assert.match(first.config, /proxy_pass http:\/\/example\.com:8080\/v1\//);
});

test("renderer can omit the managed default location", async () => {
	const host = {
		id: 13,
		enabled: true,
		domain_names: ["locations-only.example.com"],
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: 80,
		access_list_id: 0,
		certificate_id: 0,
		ssl_forced: false,
		caching_enabled: false,
		block_exploits: false,
		allow_websocket_upgrade: false,
		http2_support: false,
		hsts_enabled: false,
		hsts_subdomains: false,
		trust_forwarded_proto: false,
		advanced_config: "",
		locations: [
			{
				path: "/api/",
				forward_scheme: "http",
				forward_host: "api.example.com",
				forward_port: 8080,
				match_type: "priority_prefix",
				path_mode: "preserve_uri",
			},
		],
		nginx_config: { schema_version: 1, server: { default_location_enabled: false } },
	};

	const candidate = await buildProxyHostCandidate({ host });

	assert.doesNotMatch(candidate.config, /^\s*location \/\s*\{/m);
	assert.equal(candidate.config.match(/\bproxy_pass\b/g)?.length, 1);
	assert.match(candidate.config, /proxy_pass http:\/\/api\.example\.com:8080;/);
	assert.match(candidate.config, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
});

test("listener validation keeps domain semantics and protects reserved NPM ports", () => {
	const baseHost = {
		domain_names: ["app.example.com"],
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: 3000,
		nginx_config: { schema_version: 1, server: {} },
	};
	assert.throws(
		() => normalizeProxyHost({ ...baseHost, domain_names: [] }),
		/domain listener requires at least one domain_name/,
	);
	assert.throws(
		() =>
			normalizeProxyHost({
				...baseHost,
				domain_names: [],
				nginx_config: { schema_version: 1, listener: { mode: "port", port: 80 } },
			}),
		/reserved by Nginx Proxy Manager/,
	);
	assert.throws(
		() =>
			normalizeProxyHost({
				...baseHost,
				nginx_config: { schema_version: 1, listener: { mode: "port", port: 18080 } },
			}),
		/port listener cannot include domain_names/,
	);
});

test("port-only listener renders a standalone HTTP default server", async () => {
	const candidate = await buildProxyHostCandidate({
		host: {
			id: 14,
			enabled: true,
			domain_names: [],
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: 9000,
			access_list_id: 0,
			certificate_id: 0,
			ssl_forced: false,
			caching_enabled: false,
			block_exploits: false,
			allow_websocket_upgrade: false,
			http2_support: false,
			hsts_enabled: false,
			hsts_subdomains: false,
			trust_forwarded_proto: false,
			advanced_config: "",
			locations: [],
			nginx_config: { schema_version: 1, listener: { mode: "port", port: 18080 }, server: {} },
		},
	});
	assert.match(candidate.config, /^\s*listen 18080 default_server;/m);
	assert.match(candidate.config, /^\s*server_name _;/m);
	assert.doesNotMatch(candidate.config, /^\s*listen 80;/m);
	assert.doesNotMatch(candidate.config, /^\s*listen 443 ssl;/m);
	assert.match(candidate.config, /set \$forward_scheme http;/);
	assert.match(candidate.config, /set \$server {9}"127\.0\.0\.1";/);
	assert.match(candidate.config, /set \$port {11}9000;/);
});
