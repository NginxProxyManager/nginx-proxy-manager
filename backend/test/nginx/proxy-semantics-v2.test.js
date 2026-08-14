import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import apiValidator from "../../lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "../../schema/index.js";
import {
	flattenProxyOptionSections,
	migrateLocationNginxConfigToV2,
	migrateNginxConfigToV2,
	normalizeNginxConfig,
} from "../../internal/nginx-config-normalizer.js";
import { buildDesiredNginxArtifact } from "../../internal/nginx-config-artifact-view.js";
import { buildProxyHostCandidate } from "../../internal/nginx-config-renderer.js";
import { collectCustomIncludeManifest } from "../../internal/nginx-custom-includes.js";
import {
	PROXY_DIRECTIVE_CATALOG,
	PROXY_DIRECTIVE_ENTRIES,
	PROXY_MANAGED_DIRECTIVES,
	validateCatalogCapability,
} from "../../internal/nginx-proxy-directive-catalog.js";
import { PROXY_OPTION_PROFILE_VERSION } from "../../internal/nginx-proxy-option-profile.js";
import { NGINX_RUNTIME_CAPABILITY } from "../../internal/nginx-runtime-capability.js";

const baseHost = (overrides = {}) => ({
	id: 701,
	enabled: true,
	domain_names: ["semantic-v2.example.com"],
	forward_scheme: "http",
	forward_host: "127.0.0.1",
	forward_port: 8080,
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
	nginx_config: { schema_version: 1, server: {} },
	...overrides,
});

const defaultLocationBody = (config) => config.match(/location \/ \{([\s\S]*?)\n {2}\}/)?.[1] ?? "";

test("ARTIFACT-001 review-required desired state exposes the exact legacy backup", () => {
	const artifact = buildDesiredNginxArtifact({
		nginx_config_schema_version: 1,
		nginx_config_revision: 7,
		nginx_config: {
			schema_version: 2,
			profile_version: "npm-explicit-proxy-v1",
			listener: { mode: "domain" },
			server: { directives: {}, headers: {} },
		},
		nginx_config_migration_backup: {
			schema_version: 1,
			nginx_config: { schema_version: 1, server: { proxy_pass_trailers: false } },
		},
	});
	assert.deepEqual(artifact, {
		schema_version: 1,
		revision: 7,
		nginx_config: { schema_version: 1, server: { proxy_pass_trailers: false } },
	});
});
test("CATALOG-001 catalog is unique, complete, ordered, and matches the runtime profile", () => {
	assert.equal(PROXY_DIRECTIVE_CATALOG.profileVersion, PROXY_OPTION_PROFILE_VERSION);
	assert.equal(new Set(PROXY_DIRECTIVE_ENTRIES.map((entry) => entry.key)).size, PROXY_DIRECTIVE_ENTRIES.length);
	assert.equal(
		new Set(PROXY_DIRECTIVE_ENTRIES.map((entry) => entry.frontendKey)).size,
		PROXY_DIRECTIVE_ENTRIES.length,
	);
	assert.equal(new Set(PROXY_DIRECTIVE_ENTRIES.map((entry) => entry.order)).size, PROXY_DIRECTIVE_ENTRIES.length);
	assert.ok(PROXY_DIRECTIVE_ENTRIES.every((entry) => entry.emitPolicy === "always_when_proxying"));
	assert.ok(PROXY_MANAGED_DIRECTIVES.includes("proxy_pass_trailers"));
	assert.deepEqual(validateCatalogCapability(NGINX_RUNTIME_CAPABILITY), []);
});

test("SCHEMA-V2-001 legacy migration is materialized, grouped, idempotent, and preserves location overrides", () => {
	const legacy = {
		schema_version: 1,
		listener: { mode: "port", port: 18080 },
		server: {
			proxy_pass_trailers: false,
			proxy_read_timeout: "45s",
			request_headers: [{ name: "X-Test", operation: "set", value: "yes" }],
		},
	};
	const migrated = migrateNginxConfigToV2(legacy);
	assert.equal(migrated.schema_version, 2);
	assert.equal(migrated.listener.port, 18080);
	assert.equal(migrated.server.directives.proxy_pass_trailers, false);
	assert.equal(migrated.server.directives.proxy_buffering, true);
	assert.equal(migrated.server.headers.request[0].name, "X-Test");
	assert.deepEqual(normalizeNginxConfig(migrated), migrated);

	const location = migrateLocationNginxConfigToV2({
		proxy_read_timeout: "10s",
		response_headers: [{ name: "X-Loc", operation: "add", value: "1" }],
	});
	assert.deepEqual(location, {
		mode: "inherit",
		overrides: {
			directives: { proxy_read_timeout: "10s" },
			headers: { response: [{ name: "X-Loc", operation: "add", value_mode: "literal", value: "1" }] },
		},
	});
});

test("EXPLICIT-V2-001 every catalog field maps to a rendered directive in every managed Location", async () => {
	const candidate = await buildProxyHostCandidate({
		host: baseHost({
			locations: [
				{
					path: "/api/",
					forward_scheme: "http",
					forward_host: "127.0.0.1",
					forward_port: 8081,
					match_type: "priority_prefix",
					path_mode: "preserve_uri",
				},
			],
		}),
	});
	const body = defaultLocationBody(candidate.config);
	for (const entry of PROXY_DIRECTIVE_ENTRIES) {
		// Empty operation lists have no legal Nginx "off" form; their explicit
		// structural value remains visible in effective_config instead.
		if (
			Array.isArray(entry.profileValue) &&
			entry.profileValue.length === 0 &&
			!entry.key.startsWith("proxy_cookie_")
		)
			continue;
		for (const directive of entry.managedDirectives) {
			assert.match(body, new RegExp(`\\b${directive}\\b`), `${entry.key} -> ${directive}`);
		}
	}
	assert.match(body, /proxy_pass_trailers off;/);
	assert.match(body, /proxy_cache off;/);
	assert.match(candidate.config, /location \^~ \/api\/ \{[\s\S]*proxy_pass_trailers off;[\s\S]*proxy_cache off;/);
	assert.doesNotMatch(
		candidate.config,
		/include conf\.d\/include\/(?:proxy|assets|block-exploits|ssl-cache|ssl-ciphers|force-ssl)\.conf/,
	);
});

test("SOURCE-001 effective inheritance and line source map are complete and line-accurate", async () => {
	const candidate = await buildProxyHostCandidate({
		host: baseHost({
			nginx_config: {
				schema_version: 1,
				server: {
					proxy_read_timeout: "60s",
					hide_response_headers: ["Server"],
					request_headers: [
						{ name: "Host", operation: "set", value_mode: "literal", value: "semantic.example.com" },
					],
				},
			},
			locations: [
				{
					location_id: "api-location",
					path: "/api/",
					forward_scheme: "http",
					forward_host: "127.0.0.1",
					forward_port: 8081,
					match_type: "priority_prefix",
					path_mode: "preserve_uri",
					nginx_config: { proxy_connect_timeout: "5s" },
				},
			],
		}),
	});
	assert.equal(candidate.effectiveConfig.schema_version, 2);
	assert.equal(candidate.effectiveConfig.server.sources.proxy_pass_trailers.source, "user");
	assert.equal(candidate.effectiveConfig.locations[0].sources.proxy_read_timeout.source, "inherited");
	assert.equal(candidate.effectiveConfig.locations[0].sources.proxy_connect_timeout.source, "user");
	assert.equal(candidate.effectiveConfig.features.caching_enabled.enabled, false);
	const lines = candidate.config.split("\n");
	for (const record of candidate.sourceMap) {
		assert.ok(record.line_start >= 1 && record.line_start <= lines.length);
		if (record.directive) assert.match(lines[record.line_start - 1].trim(), new RegExp(`^${record.directive}\\b`));
	}
	const trailers = candidate.sourceMap.filter(
		(item) => item.field === "proxy_pass_trailers" && item.path === "/api/",
	);
	assert.equal(trailers.length, 1);
	assert.equal(trailers[0].source, "inherited");
	const hiddenServerHeader = candidate.sourceMap.find(
		(item) => item.directive === "proxy_hide_header" && item.path === "/api/",
	);
	assert.equal(hiddenServerHeader?.field, "hide_response_headers");
	assert.equal(hiddenServerHeader?.frontend_field, "hideResponseHeaders");
	assert.equal(hiddenServerHeader?.source, "inherited");
	const overriddenHostHeader = candidate.sourceMap.find(
		(item) =>
			item.directive === "proxy_set_header" &&
			item.path === "/api/" &&
			lines[item.line_start - 1].includes("Host"),
	);
	assert.equal(overriddenHostHeader?.field, "request_headers");
	assert.equal(overriddenHostHeader?.frontend_field, "requestHeaders");
	assert.equal(overriddenHostHeader?.source, "inherited");
	assert.equal(candidate.snapshot.source_map.length, candidate.sourceMap.length);
	assert.deepEqual(candidate.snapshot.effective_config, candidate.effectiveConfig);

	const migrated = await buildProxyHostCandidate({
		host: baseHost({
			nginx_config: { schema_version: 2, server: candidate.snapshot.effective_config.server.effective },
			nginx_config_migration_status: "migrated",
			nginx_config_migration_backup: {
				schema_version: 1,
				nginx_config: { schema_version: 1, server: { proxy_read_timeout: "60s" } },
				locations: [],
			},
		}),
	});
	assert.equal(migrated.effectiveConfig.server.sources.proxy_read_timeout.source, "user");
	assert.equal(migrated.effectiveConfig.server.sources.proxy_pass_trailers.source, "profile");
});

test("CAPABILITY-001 unsupported nginx versions fail before candidate publication", async () => {
	await assert.rejects(
		() => buildProxyHostCandidate({ host: baseHost(), capability: { nginx_version: "1.26.3" } }),
		(error) =>
			error?.details?.diagnostics?.some(
				(item) => item.code === "NGINX_DIRECTIVE_UNSUPPORTED_VERSION" && item.field === "proxy_pass_trailers",
			),
	);
});

test("CONSISTENCY-001 migrated desired state renders byte-identically across preview/save/publish inputs", async () => {
	const first = await buildProxyHostCandidate({ host: baseHost() });
	const desired = first.snapshot.desired;
	assert.equal(desired.nginx_config.schema_version, 2);
	assert.equal(flattenProxyOptionSections(desired.nginx_config.server).proxy_pass_trailers, false);
	const second = await buildProxyHostCandidate({ host: desired, capability: first.capability });
	assert.equal(second.config, first.config);
	assert.equal(second.configHash, first.configHash);
	assert.equal(second.payloadHash, first.payloadHash);
	assert.equal(second.capabilityHash, first.capabilityHash);
});

test("OWNERSHIP-001 managed directives in custom includes are rejected and dependency-bound", async () => {
	const include = {
		path: "/data/nginx/custom/server_proxy.conf",
		exists: true,
		hash: "sha256:test",
		size: 24,
		diagnostics: [
			{
				severity: "error",
				code: "ADVANCED_STRUCTURED_CONFLICT",
				scope: "custom_include",
				path: "/data/nginx/custom/server_proxy.conf",
				line: 1,
				message: "Custom include conflicts with proxy_read_timeout",
			},
		],
	};
	await assert.rejects(
		() => buildProxyHostCandidate({ host: baseHost(), dependencies: { includes: [include] } }),
		(error) => error?.details?.diagnostics?.some((item) => item.scope === "custom_include"),
	);
	const clean = await buildProxyHostCandidate({
		host: baseHost(),
		dependencies: { includes: [{ ...include, diagnostics: [] }] },
	});
	const missing = await buildProxyHostCandidate({
		host: baseHost(),
		dependencies: { includes: [{ path: include.path, exists: false, hash: null, size: 0, diagnostics: [] }] },
	});
	assert.notEqual(clean.dependencyHash, missing.dependencyHash);
});

test("OWNERSHIP-002 custom include files are hashed, missing-safe, and scanned from disk", async () => {
	const directory = await mkdtemp(join(tmpdir(), "npm-semantic-includes-"));
	try {
		const cleanPath = join(directory, "clean.conf");
		const conflictPath = join(directory, "conflict.conf");
		const missingPath = join(directory, "missing.conf");
		await writeFile(cleanPath, "# unmanaged custom directive\ngzip on;\n", "utf8");
		await writeFile(conflictPath, "proxy_read_timeout 10s;\n", "utf8");

		const manifest = await collectCustomIncludeManifest([missingPath, conflictPath, cleanPath, cleanPath]);
		assert.equal(manifest.length, 3);
		assert.deepEqual(
			manifest.map((item) => item.path),
			[cleanPath, conflictPath, missingPath].sort(),
		);

		const clean = manifest.find((item) => item.path === cleanPath);
		assert.equal(clean.exists, true);
		assert.match(clean.hash, /^sha256:[a-f0-9]{64}$/);
		assert.ok(clean.size > 0);
		assert.deepEqual(clean.diagnostics, []);

		const conflict = manifest.find((item) => item.path === conflictPath);
		assert.equal(conflict.exists, true);
		assert.equal(conflict.diagnostics.length, 1);
		assert.equal(conflict.diagnostics[0].code, "ADVANCED_STRUCTURED_CONFLICT");
		assert.equal(conflict.diagnostics[0].scope, "custom_include");
		assert.equal(conflict.diagnostics[0].path, conflictPath);

		assert.deepEqual(
			manifest.find((item) => item.path === missingPath),
			{
				path: missingPath,
				exists: false,
				hash: null,
				size: 0,
				diagnostics: [],
			},
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("COMPOSITE-001 TLS, cache, websocket, ACL, HSTS, exploit blocking, and monitoring expand consistently", async () => {
	const dependencies = {
		certificate: { id: 3, provider: "other", fullchain_hash: "sha256:cert", key_hash: "sha256:key" },
		access_list: {
			id: 9,
			items: [{ username: "operator" }],
			clients: [{ directive: "allow", address: "10.0.0.0/8" }],
			pass_auth: false,
			satisfy_any: true,
		},
	};
	const candidate = await buildProxyHostCandidate({
		host: baseHost({
			certificate_id: 3,
			ssl_forced: true,
			hsts_enabled: true,
			hsts_subdomains: true,
			caching_enabled: true,
			block_exploits: true,
			allow_websocket_upgrade: true,
			access_list_id: 9,
			locations: [
				{
					path: "/api/",
					forward_scheme: "http",
					forward_host: "127.0.0.1",
					forward_port: 8081,
					match_type: "priority_prefix",
					path_mode: "preserve_uri",
				},
			],
		}),
		dependencies,
	});
	const config = candidate.config;
	assert.equal((config.match(/auth_basic_user_file\s+\/data\/access\/9;/g) || []).length, 3);
	assert.equal((config.match(/proxy_set_header\s+Authorization\s+"";/g) || []).length, 3);
	assert.equal((config.match(/allow\s+10\.0\.0\.0\/8;/g) || []).length, 3);
	assert.equal((config.match(/satisfy\s+any;/g) || []).length, 3);
	assert.equal((config.match(/add_header Strict-Transport-Security \$hsts_header always;/g) || []).length, 4);
	assert.equal(
		(config.match(/access_log \/data\/logs\/npm-monitor-http\.log npm_proxy_metrics_v1/g) || []).length,
		4,
	);
	assert.equal((config.match(/proxy_set_header Upgrade \$http_upgrade;/g) || []).length, 3);
	assert.equal((config.match(/proxy_set_header Connection \$http_connection;/g) || []).length, 3);
	assert.match(config, /proxy_cache public-cache;/);
	assert.equal((config.match(/proxy_cache off;/g) || []).length, 2);
	assert.match(config, /# npm:feature field=block_exploits source=user begin/);
	assert.match(config, /ssl_certificate \/data\/custom_ssl\/npm-3\/fullchain\.pem;/);
	assert.equal(candidate.effectiveConfig.features.hsts_enabled.enabled, true);
	assert.equal(candidate.effectiveConfig.features.access_list_id.enabled, true);
	assert.equal(candidate.effectiveConfig.features.monitoring_logs.enabled, true);
	const monitoringMarker = candidate.sourceMap.find((item) => item.field === "feature.monitoring_logs");
	assert.equal(monitoringMarker?.frontend_field, null);
	const locationHsts = candidate.sourceMap.find(
		(item) => item.directive === "add_header" && item.field === "feature.hsts_enabled" && item.path === "/api/",
	);
	assert.equal(locationHsts?.frontend_field, "hstsEnabled");

	const passThrough = await buildProxyHostCandidate({
		host: baseHost({ access_list_id: 9 }),
		dependencies: { access_list: { ...dependencies.access_list, pass_auth: true } },
	});
	const stripped = await buildProxyHostCandidate({
		host: baseHost({ access_list_id: 9 }),
		dependencies: { access_list: { ...dependencies.access_list, pass_auth: false } },
	});
	assert.notEqual(passThrough.dependencyHash, stripped.dependencyHash);
});

test("API-CONTRACT-001 preview and artifact response schemas match runtime payloads", async () => {
	const compiled = await getCompiledSchema();
	const previewSchema =
		compiled.paths["/nginx/proxy-hosts/nginx-config/preview"].post.responses["200"].content["application/json"]
			.schema;
	const candidate = await buildProxyHostCandidate({ host: baseHost() });
	const preview = {
		valid: true,
		config: candidate.config,
		payload_hash: candidate.payloadHash,
		hash: candidate.configHash,
		dependency_hash: candidate.dependencyHash,
		capability_hash: candidate.capabilityHash,
		template_version: candidate.templateVersion,
		template_hash: candidate.templateHash,
		base_revision: null,
		preview_token: null,
		validation_scope: "full",
		unresolved_dependencies: [],
		diagnostics: candidate.diagnostics,
		effective_config: candidate.effectiveConfig,
		source_map: candidate.sourceMap,
		capability: candidate.capability,
	};
	assert.equal(await apiValidator(previewSchema, preview), preview);

	const artifactSchema =
		compiled.paths["/nginx/proxy-hosts/{hostID}/nginx-config"].get.responses["200"].content["application/json"]
			.schema;
	const desired = buildDesiredNginxArtifact({
		nginx_config_schema_version: 1,
		nginx_config_revision: 7,
		nginx_config: candidate.snapshot.desired.nginx_config,
		nginx_config_migration_backup: { nginx_config: { schema_version: 1, server: { proxy_pass_trailers: false } } },
	});
	const artifact = {
		host_id: 701,
		status: "pending",
		desired_revision: 7,
		applied_revision: null,
		deployed: null,
		candidate: null,
		desired,
		applied_snapshot: null,
		migration: { status: "review_required", migrated_on: null, diagnostics: [] },
		last_error: null,
		last_checked_at: null,
	};
	assert.equal(await apiValidator(artifactSchema, artifact), artifact);
});

test("API-SEMANTIC-001 preview schema rejects unknown fields before semantic rendering", async () => {
	await getCompiledSchema();
	const schema = getValidationSchema("/nginx/proxy-hosts/nginx-config/preview", "post");
	assert.ok(schema);
	await assert.rejects(
		() => apiValidator(schema, { domain_names: ["schema.example.com"], nginx_config_typo: {} }),
		(error) => /additional properties/i.test(error?.message || ""),
	);
	const accepted = await apiValidator(schema, {
		domain_names: ["schema.example.com"],
		nginx_config: migrateNginxConfigToV2({ schema_version: 1, server: {} }),
	});
	assert.equal(accepted.nginx_config.schema_version, 2);
});
