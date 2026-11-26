import assert from "node:assert/strict";
import test from "node:test";
import {
	generateToken,
	hashSecret,
	hasUnsafeConfiguration,
	operationFor,
	permits,
	redactErrorResponse,
	redactResponse,
	resources,
	scopes,
	tokenPattern,
	tokenPrefix,
	tokenStatus,
	verifySecret,
} from "../lib/api-token-policy.js";

const expectedResources = ["proxy_hosts", "redirection_hosts", "dead_hosts", "streams", "access_lists", "certificates"];
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "CONNECT", "get", "post", ""];
const actions = ["enable", "disable", "upload", "renew", "download", "future-operation"];

const freezeDeep = (value) => {
	if (value && typeof value === "object") {
		for (const nested of Object.values(value)) freezeDeep(nested);
		Object.freeze(value);
	}
	return value;
};

test("the scope catalogue contains exactly read and write for the six supported resources", () => {
	assert.deepEqual(resources, expectedResources);
	assert.deepEqual(
		scopes,
		expectedResources.flatMap((resource) => [`${resource}:read`, `${resource}:write`]),
	);
	assert.equal(new Set(scopes).size, 12);
	assert.equal(tokenPrefix, "npm_pat_");
});

test("generated tokens have unique random IDs and secrets and store only the secret hash", () => {
	const ids = new Set();
	const secrets = new Set();
	const tokens = new Set();
	for (let index = 0; index < 64; index += 1) {
		const generated = generateToken();
		assert.deepEqual(Object.keys(generated).sort(), ["hash", "publicId", "token"]);
		const parsed = tokenPattern.exec(generated.token);
		assert.ok(parsed);
		assert.equal(parsed[1], generated.publicId);
		assert.match(generated.publicId, /^[a-f0-9]{24}$/);
		assert.match(generated.hash, /^[a-f0-9]{64}$/);
		assert.equal(Buffer.from(parsed[2], "base64url").length, 32);
		assert.equal(generated.hash, hashSecret(parsed[2]));
		assert.notEqual(generated.hash, parsed[2]);
		assert.notEqual(generated.hash, hashSecret(generated.token));
		assert.equal(verifySecret(parsed[2], generated.hash), true);
		ids.add(generated.publicId);
		secrets.add(parsed[2]);
		tokens.add(generated.token);
	}
	assert.equal(ids.size, 64);
	assert.equal(secrets.size, 64);
	assert.equal(tokens.size, 64);
});

test("SHA-256 hashing matches a known vector and verification rejects changed secrets", () => {
	assert.equal(hashSecret("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
	const { token, hash } = generateToken();
	const secret = tokenPattern.exec(token)[2];
	const changed = `${secret[0] === "A" ? "B" : "A"}${secret.slice(1)}`;
	assert.equal(verifySecret(secret, hash), true);
	for (const invalid of [changed, secret.slice(1), `${secret}A`, "", token]) {
		assert.equal(verifySecret(invalid, hash), false);
	}
});

test("verification rejects malformed stored hashes without throwing", () => {
	const { token, hash } = generateToken();
	const secret = tokenPattern.exec(token)[2];
	for (const invalid of [
		null,
		undefined,
		0,
		{},
		[],
		"",
		hash.slice(1),
		`${hash}0`,
		hash.toUpperCase(),
		"g".repeat(64),
	]) {
		assert.equal(verifySecret(secret, invalid), false);
	}
	assert.equal(verifySecret(secret, "0".repeat(64)), false);
});

test("token parsing rejects missing, tampered, extra, and unsafe format characters", () => {
	const publicId = "a".repeat(24);
	const secret = "b".repeat(43);
	const valid = `${tokenPrefix}${publicId}.${secret}`;
	assert.deepEqual(tokenPattern.exec(valid)?.slice(1), [publicId, secret]);
	for (const invalid of [
		"",
		`${publicId}.${secret}`,
		`NPM_PAT_${publicId}.${secret}`,
		`${tokenPrefix}${publicId.toUpperCase()}.${secret}`,
		`${tokenPrefix}${publicId.slice(1)}.${secret}`,
		`${tokenPrefix}${publicId}a.${secret}`,
		`${tokenPrefix}${publicId}${secret}`,
		`${tokenPrefix}${publicId}.${secret.slice(1)}`,
		`${tokenPrefix}${publicId}.${secret}b`,
		`${tokenPrefix}${publicId}.${secret.slice(1)}+`,
		`${tokenPrefix}${publicId}.${secret.slice(1)}/`,
		`${valid}=`,
		`${valid}.extra`,
		`Bearer ${valid}`,
		` ${valid}`,
		`${valid} `,
		`${valid}\n`,
		`${valid}\r\n`,
		`${valid}\0`,
		`${valid}%0a`,
	]) {
		assert.equal(tokenPattern.test(invalid), false, JSON.stringify(invalid));
	}
});

for (const resource of expectedResources) {
	test(`${resource} scopes grant only matching reads or writes, with write implying read`, () => {
		assert.equal(permits([], resource, "read"), false);
		assert.equal(permits([], resource, "write"), false);
		assert.equal(permits([`${resource}:read`], resource, "read"), true);
		assert.equal(permits([`${resource}:read`], resource, "write"), false);
		assert.equal(permits([`${resource}:write`], resource, "read"), true);
		assert.equal(permits([`${resource}:write`], resource, "write"), true);
		assert.equal(permits([`${resource}:read`, `${resource}:write`], resource, "write"), true);
		for (const other of expectedResources.filter((candidate) => candidate !== resource)) {
			assert.equal(permits([`${other}:read`, `${other}:write`], resource, "read"), false);
			assert.equal(permits([`${other}:read`, `${other}:write`], resource, "write"), false);
		}
		for (const invalidScope of [
			"*",
			"*:write",
			`${resource}:*`,
			resource,
			`${resource}:admin`,
			`${resource}:WRITE`,
		]) {
			assert.equal(permits([invalidScope], resource, "read"), false);
			assert.equal(permits([invalidScope], resource, "write"), false);
		}
	});

	test(`${resource} operation registry permits only explicit methods and actions`, () => {
		const path = `/nginx/${resource.replaceAll("_", "-")}`;
		for (const method of methods) {
			const collectionMode = method === "GET" ? "read" : method === "POST" ? "write" : null;
			assert.deepEqual(
				operationFor(method, path),
				collectionMode ? { resource, mode: collectionMode, id: null } : null,
				`${method} ${path}`,
			);
			const itemMode =
				method === "GET"
					? "read"
					: method === "DELETE" || (method === "PUT" && resource !== "certificates")
						? "write"
						: null;
			assert.deepEqual(
				operationFor(method, `${path}/42`),
				itemMode ? { resource, mode: itemMode, id: 42 } : null,
				`${method} ${path}/42`,
			);
			for (const action of actions) {
				const hostAction =
					["enable", "disable"].includes(action) && !["access_lists", "certificates"].includes(resource);
				const certificateAction = ["upload", "renew"].includes(action) && resource === "certificates";
				assert.deepEqual(
					operationFor(method, `${path}/42/${action}`),
					method === "POST" && (hostAction || certificateAction) ? { resource, mode: "write", id: 42 } : null,
					`${method} ${path}/42/${action}`,
				);
			}
		}
	});
}

test("unknown resources and modes cannot acquire access even with all supported scopes", () => {
	for (const resource of ["users", "tokens", "api_tokens", "settings", "reports", "proxy-hosts", "", "*"]) {
		assert.equal(permits([...scopes, `${resource}:read`, `${resource}:write`], resource, "read"), false);
		assert.equal(permits([...scopes, `${resource}:read`, `${resource}:write`], resource, "write"), false);
	}
	for (const resource of expectedResources) {
		for (const mode of ["admin", "delete", "READ", "WRITE", "", null, undefined]) {
			assert.equal(permits(scopes, resource, mode), false, `${resource}:${mode}`);
		}
	}
});

test("security, token minting, auxiliary, and future endpoints are denied for every method", () => {
	for (const path of [
		"/",
		"/users",
		"/users/1",
		"/users/1/auth",
		"/users/1/permissions",
		"/users/me/2fa",
		"/tokens",
		"/tokens/refresh",
		"/tokens/2fa",
		"/api-tokens",
		"/api-tokens/1",
		"/api-tokens/1/revoke",
		"/settings",
		"/settings/1",
		"/audit-log",
		"/reports/hosts",
		"/nginx",
		"/nginx/future-resource",
		"/nginx/future-resource/1",
		"/nginx/certificates/dns-providers",
		"/nginx/certificates/test-http",
		"/nginx/certificates/validate",
		"/nginx/certificates/42/download",
		"/api/nginx/proxy-hosts",
	]) {
		for (const method of methods) assert.equal(operationFor(method, path), null, `${method} ${path}`);
	}
});

test("trailing segments, ambiguous separators, and encoded paths never match an operation", () => {
	for (const resource of expectedResources) {
		const path = `/nginx/${resource.replaceAll("_", "-")}`;
		for (const invalid of [
			`${path}/`,
			`${path}/42/`,
			`${path}/42/enable/`,
			`${path}/42/enable/extra`,
			`${path}/42/extra/enable`,
			`${path}/42.json`,
			`${path}/42?expand=owner`,
			`${path}/42#fragment`,
			`${path}//42`,
			`${path}\\42`,
			`${path}/../users`,
			`${path}/42/../../tokens`,
			`${path}/%34%32`,
			`${path}%2f42`,
			`${path}/42%2Fenable`,
			`${path}/42%252fdownload`,
			`${path}/%2e%2e/users`,
			`${path}/42%00`,
			`${path}/42\0`,
			`${path}/42\n`,
			`${path}/42\r\n`,
			`${path}/42;anything`,
			`${path.toUpperCase()}/42`,
			`/${path}/42`,
			` ${path}/42`,
		]) {
			for (const method of ["GET", "POST", "PUT", "DELETE"]) {
				assert.equal(operationFor(method, invalid), null, `${method} ${JSON.stringify(invalid)}`);
			}
		}
	}
});

test("object IDs must be positive unambiguous safe integers", () => {
	for (const resource of expectedResources) {
		const path = `/nginx/${resource.replaceAll("_", "-")}`;
		for (const id of ["0", "00", "01", "-1", "+1", "1.0", "1e2", "0x10", "NaN", "Infinity", " 1", "1 ", "９"]) {
			assert.equal(operationFor("GET", `${path}/${id}`), null, `${path}/${id}`);
		}
		for (const id of ["9007199254740992", "9007199254740993", "9".repeat(400)]) {
			for (const method of ["GET", "PUT", "DELETE", "POST"]) {
				for (const action of ["", "/enable", "/upload"]) {
					assert.equal(
						operationFor(method, `${path}/${id}${action}`),
						null,
						`${method} ${path}/${id}${action}`,
					);
				}
			}
		}
	}
});

test("nonempty raw custom configuration is rejected at the root and in nested locations", () => {
	for (const advancedConfig of [
		"include /tmp/synthetic.conf;",
		"\n proxy_set_header X-Synthetic yes; \n",
		"# a comment is still custom configuration",
		42,
		true,
		{},
		[],
	]) {
		assert.equal(hasUnsafeConfiguration({ advanced_config: advancedConfig }), true);
		assert.equal(
			hasUnsafeConfiguration({
				advanced_config: "",
				locations: [
					{ path: "/safe", advanced_config: "" },
					{ path: "/other", advanced_config: advancedConfig },
				],
			}),
			true,
		);
		assert.equal(
			hasUnsafeConfiguration({ locations: [{ locations: [{ advanced_config: advancedConfig }] }] }),
			true,
		);
	}
});

test("route targets, paths, and domain fields reject directive injection at every location depth", () => {
	const fields = {
		forward_host: "backend.example.test",
		forwarding_host: "backend.example.test",
		forward_domain_name: "redirect.example.test",
		forward_path: "/target",
		path: "/route",
		domain_names: "public.example.test",
	};
	for (const [field, prefix] of Object.entries(fields)) {
		for (const suffix of [
			"; include /tmp/synthetic.conf;",
			"{return 200;}",
			"}server{",
			"$request_uri",
			"\\escaped",
			'"quoted"',
			"'quoted'",
			"# comment",
			" trailing",
			"\ninclude",
			"\rinclude",
			"\tinclude",
		]) {
			const value = `${prefix}${suffix}`;
			const record = { [field]: field === "domain_names" ? ["safe.example.test", value] : value };
			assert.equal(hasUnsafeConfiguration(record), true, `${field}: ${JSON.stringify(value)}`);
			assert.equal(
				hasUnsafeConfiguration({ locations: [record] }),
				true,
				`location ${field}: ${JSON.stringify(value)}`,
			);
			assert.equal(
				hasUnsafeConfiguration({ locations: [{ locations: [record] }] }),
				true,
				`nested location ${field}: ${JSON.stringify(value)}`,
			);
		}
	}
});

test("ordinary hostnames, IPs, routes, redirects, and blank custom configuration remain permitted", () => {
	for (const host of ["backend.example.test", "service_1.internal", "127.0.0.1", "[2001:db8::1]", "localhost"]) {
		assert.equal(hasUnsafeConfiguration({ forward_host: host, forwarding_host: host }), false, host);
	}
	for (const advancedConfig of ["", " ", "\t\r\n"]) {
		assert.equal(hasUnsafeConfiguration({ advanced_config: advancedConfig }), false);
		assert.equal(hasUnsafeConfiguration({ locations: [{ path: "/", advanced_config: advancedConfig }] }), false);
	}
	for (const path of ["/", "/api/v1/items", "/item-1_2.~%20+,:=@&!()*"]) {
		assert.equal(hasUnsafeConfiguration({ path, forward_path: path }), false, path);
	}
	assert.equal(hasUnsafeConfiguration({ forward_path: "" }), false);
	assert.equal(hasUnsafeConfiguration({ forward_path: "/search?q=test&next=%2Fapi" }), false);
	assert.equal(
		hasUnsafeConfiguration({ forward_domain_name: "redirect.example.test:8443/path?key=value&more=1" }),
		false,
	);
	assert.equal(
		hasUnsafeConfiguration({ domain_names: ["example.test", "*.example.test", "test-1.example.test"] }),
		false,
	);
	assert.equal(hasUnsafeConfiguration({ locations: [] }), false);
	assert.equal(hasUnsafeConfiguration({}), false);
	assert.equal(hasUnsafeConfiguration(null), false);
	assert.equal(hasUnsafeConfiguration(undefined), false);
});

test("malformed domain and location collections and nonabsolute paths are rejected", () => {
	for (const domainNames of [null, "example.test", {}, [null], [42], [""], ["valid.example.test", {}]]) {
		assert.equal(hasUnsafeConfiguration({ domain_names: domainNames }), true);
	}
	for (const locations of [null, "not-an-array", {}, 42]) {
		assert.equal(hasUnsafeConfiguration({ locations }), true);
	}
	for (const path of ["relative", "@named", "= /exact", "~ /regex", ""]) {
		assert.equal(hasUnsafeConfiguration({ path }), true, path);
	}
	for (const forwardPath of ["relative", "$request_uri", "http://example.test"]) {
		assert.equal(hasUnsafeConfiguration({ forward_path: forwardPath }), true, forwardPath);
	}
});

test("ACL client addresses reject injected directives, variables, comments, and delimiters", () => {
	for (const address of [
		"::1%eth0; include /tmp/unsafe; #",
		"127.0.0.1;include /tmp/synthetic.conf;",
		"127.0.0.1\nallow all",
		"127.0.0.1\rallow all",
		"127.0.0.1\tallow all",
		"127.0.0.1 deny all",
		"127.0.0.1#comment",
		"127.0.0.1}server{",
		"$remote_addr",
		'"127.0.0.1"',
		"'127.0.0.1'",
		"127.0.0.1\\escaped",
		"127.0.0.1\0",
	]) {
		const record = freezeDeep({
			clients: [
				{ directive: "allow", address: "192.0.2.0/24" },
				{ directive: "deny", address },
			],
		});
		const before = JSON.stringify(record);
		assert.equal(hasUnsafeConfiguration(record), true, JSON.stringify(address));
		assert.equal(hasUnsafeConfiguration({ locations: [record] }), true, `location ${JSON.stringify(address)}`);
		assert.equal(JSON.stringify(record), before);
	}
});

test("ordinary ACL addresses and networks remain permitted and unchanged", () => {
	const record = freezeDeep({
		clients: ["127.0.0.1", "192.0.2.0/24", "::1", "2001:db8::/32", "fe80::1%eth0", "all"].map((address) => ({
			directive: "allow",
			address,
		})),
	});
	const before = JSON.stringify(record);
	assert.equal(hasUnsafeConfiguration(record), false);
	assert.equal(hasUnsafeConfiguration({ locations: [record] }), false);
	assert.equal(JSON.stringify(record), before);
	assert.equal(hasUnsafeConfiguration({ clients: [] }), false);
});

test("malformed ACL collections and missing or nonstring addresses are rejected", () => {
	for (const clients of [
		null,
		{},
		"127.0.0.1",
		42,
		[{}],
		[{ address: null }],
		[{ address: 42 }],
		[{ address: "" }],
	]) {
		assert.equal(hasUnsafeConfiguration({ clients }), true);
	}
});

test("configuration validation does not mutate safe or rejected records or nested locations", () => {
	for (const unsafe of [false, true]) {
		const record = freezeDeep({
			id: 42,
			forward_scheme: "https",
			forward_host: "backend.example.test",
			forward_port: 443,
			domain_names: ["public.example.test"],
			advanced_config: "",
			locations: [
				{ path: "/api", forward_host: "127.0.0.1", forward_path: "/v1", advanced_config: "" },
				{ path: "/other", advanced_config: unsafe ? "return 200;" : "\n" },
			],
		});
		const before = JSON.stringify(record);
		assert.equal(hasUnsafeConfiguration(record), unsafe);
		assert.equal(JSON.stringify(record), before);
		assert.equal(hasUnsafeConfiguration(record), unsafe);
	}
});

test("response redaction removes credentials and expanded relationships recursively without mutating rows", () => {
	const hiddenKeys = [
		"owner",
		"certificate",
		"access_list",
		"proxy_hosts",
		"redirection_hosts",
		"dead_hosts",
		"streams",
		"secret",
		"secret_hash",
		"password",
		"dns_provider_credentials",
		"certificate_key",
		"totp_secret",
		"totp_pending_secret",
		"backup_codes",
		"debug",
	];
	const hiddenValues = Object.fromEntries(hiddenKeys.map((key) => [key, { value: `REMOVE-${key}` }]));
	const created = new Date("2026-01-02T03:04:05.000Z");
	const row = freezeDeep({
		...hiddenValues,
		id: 42,
		owner_user_id: 7,
		certificate_id: 11,
		access_list_id: 12,
		created_on: created,
		meta: { ...hiddenValues, nginx_online: true },
		items: [{ ...hiddenValues, username: "synthetic-user" }],
		locations: [{ path: "/service", nested: [{ ...hiddenValues, enabled: false }] }],
	});
	const before = JSON.stringify(row);
	const redacted = redactResponse(row);
	assert.deepEqual(redacted, {
		id: 42,
		owner_user_id: 7,
		certificate_id: 11,
		access_list_id: 12,
		created_on: created,
		meta: { nginx_online: true },
		items: [{ username: "synthetic-user" }],
		locations: [{ path: "/service", nested: [{ enabled: false }] }],
	});
	assert.equal(JSON.stringify(row), before);
	assert.equal(JSON.stringify(redacted).includes("REMOVE-"), false);
	assert.notEqual(redacted, row);
	assert.notEqual(redacted.meta, row.meta);
	assert.notEqual(redacted.items, row.items);
	assert.notEqual(redacted.items[0], row.items[0]);
	assert.notEqual(redacted.locations[0].nested, row.locations[0].nested);
	assert.equal(redacted.created_on, created);
	assert.deepEqual(redactResponse(redacted), redacted);
});

test("raw Nginx configuration is preserved exactly, including strings resembling secret fields", () => {
	const config = 'proxy_set_header X-Example "password=synthetic; secret=synthetic";\n# certificate_key\n';
	const row = freezeDeep({
		advanced_config: config,
		locations: [{ path: "/", advanced_config: config, password: "REMOVE-password" }],
		meta: { nginx_err: "synthetic config error", certificate_key: "REMOVE-key" },
	});
	assert.deepEqual(redactResponse(row), {
		advanced_config: config,
		locations: [{ path: "/", advanced_config: config }],
		meta: { nginx_err: "synthetic config error" },
	});
	assert.equal(row.locations[0].password, "REMOVE-password");
	assert.equal(row.meta.certificate_key, "REMOVE-key");
});

test("redaction preserves primitives, nulls, empty containers, and array ordering", () => {
	for (const value of [null, undefined, false, true, 0, 42, "", "raw text"]) {
		assert.equal(redactResponse(value), value);
	}
	assert.deepEqual(redactResponse({}), {});
	assert.deepEqual(redactResponse([]), []);
	assert.deepEqual(redactResponse([null, { id: 1, secret: "hidden" }, false, [2, { password: "hidden" }]]), [
		null,
		{ id: 1 },
		false,
		[2, {}],
	]);
});

test("token lifecycle status shares authentication and management invalidation rules", () => {
	const user = { api_token_version: 2, is_disabled: 0, is_deleted: 0 };
	const auth = { secret: "stored-password-hash" };
	const token = { owner_version: 2, password_version: hashSecret(auth.secret), expires_on: "2030-01-01T00:00:00Z" };
	const now = Date.parse("2029-01-01T00:00:00Z");
	assert.equal(tokenStatus(token, user, auth, now), "active");
	for (const invalidUser of [
		null,
		{ ...user, api_token_version: 3 },
		{ ...user, is_disabled: 1 },
		{ ...user, is_deleted: 1 },
	]) {
		assert.equal(tokenStatus(token, invalidUser, auth, now), "revoked");
	}
	assert.equal(tokenStatus(token, user, null, now), "revoked");
	assert.equal(tokenStatus(token, user, { secret: "new-password-hash" }, now), "revoked");
	assert.equal(tokenStatus({ ...token, revoked_on: "2028-01-01T00:00:00Z" }, user, auth, now), "revoked");
	assert.equal(tokenStatus(token, user, auth, Date.parse(token.expires_on)), "expired");
	assert.equal(tokenStatus({ ...token, expires_on: "invalid" }, user, auth, now), "expired");
});

test("PAT error responses expose only bounded protocol messages", () => {
	for (const status of [400, 401, 403, 404, 429, 500, 502]) {
		const result = redactErrorResponse(status);
		assert.equal(result.error.code, status);
		assert.equal(typeof result.error.message, "string");
		assert.deepEqual(Object.keys(result.error), ["code", "message"]);
	}
});
