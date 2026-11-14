/**
 * Regression tests: values a non-admin can set must never add nginx directives.
 *
 * Templates write these values into config as-is, so each one is checked three ways:
 * - the API rejects injection attempts (real request schemas, real validator)
 * - accepted values, rendered through the real templates, produce exactly the same nginx
 *   statement structure as a plain value (parsed with nginx's tokenizer rules)
 * - generateConfig's render-time check refuses unsafe values already stored in the database
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import {
	assertHostRenderable,
	isValid,
	isValidClientAddress,
	isValidStreamHost,
	patterns,
} from "../lib/nginx-values.js";
import utils from "../lib/utils.js";
import apiValidator from "../lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "../schema/index.js";

const TEMPLATES = new URL("../templates/", import.meta.url);

// ---------------------------------------------------------------------------------------------
// A tokenizer following ngx_conf_read_token: whitespace separates, ";" ends a statement, "{"
// opens a block, "}" closes one, "#" at the start of a token comments to end of line, quotes
// group, "\" escapes the next character, and "${" doesn't open a block.
// ---------------------------------------------------------------------------------------------
const parseNginx = (text) => {
	const root = [];
	const stack = [root];
	let args = [];
	let i = 0;
	const n = text.length;
	const isSpace = (c) => c === " " || c === "\t" || c === "\r" || c === "\n";

	while (i < n) {
		const c = text[i];
		if (isSpace(c)) {
			i++;
		} else if (c === "#") {
			while (i < n && text[i] !== "\n") i++;
		} else if (c === ";") {
			if (!args.length) throw new Error(`unexpected ";" at ${i}`);
			stack.at(-1).push({ name: args[0], args: args.slice(1) });
			args = [];
			i++;
		} else if (c === "{") {
			if (!args.length) throw new Error(`unexpected "{" at ${i}`);
			const block = { name: args[0], args: args.slice(1), block: [] };
			stack.at(-1).push(block);
			stack.push(block.block);
			args = [];
			i++;
		} else if (c === "}") {
			if (args.length) throw new Error(`unexpected "}" at ${i}`);
			if (stack.length === 1) throw new Error(`unbalanced "}" at ${i}`);
			stack.pop();
			i++;
		} else if (c === '"' || c === "'") {
			let tok = c;
			i++;
			while (i < n && text[i] !== c) {
				if (text[i] === "\\" && i + 1 < n) {
					tok += text[i] + text[i + 1];
					i += 2;
				} else {
					tok += text[i++];
				}
			}
			if (i >= n) throw new Error("unterminated quoted string");
			tok += c;
			i++;
			if (i < n && !isSpace(text[i]) && text[i] !== ";" && text[i] !== "{") {
				throw new Error(`unexpected "${text[i]}" after quoted string`);
			}
			args.push(tok);
		} else {
			let tok = "";
			while (i < n) {
				const d = text[i];
				if (d === "\\" && i + 1 < n) {
					tok += d + text[i + 1];
					i += 2;
					continue;
				}
				if (d === "$" && text[i + 1] === "{") {
					tok += "${";
					i += 2;
					continue;
				}
				if (isSpace(d) || d === ";" || d === "{") break;
				tok += d;
				i++;
			}
			args.push(tok);
		}
	}
	if (args.length) throw new Error("statement without ;");
	if (stack.length !== 1) throw new Error("unclosed block");
	return root;
};

// Statement names and argument counts, nested; values themselves don't matter
const shape = (stmts) =>
	stmts.map((s) => `${s.name}/${s.args.length}${s.block ? `{${shape(s.block).join(",")}}` : ""}`);

const find = (stmts, name) => {
	for (const s of stmts) {
		if (s.name === name) return s;
		if (s.block) {
			const f = find(s.block, name);
			if (f) return f;
		}
	}
	return null;
};

const render = (file, ctx) =>
	utils.getRenderEngine().parseAndRender(fs.readFileSync(new URL(file, TEMPLATES), "utf8"), ctx);

// Same structure as a plain value, or throws (a value that breaks parsing changes it too)
const sameShapeAs = async (file, makeCtx, plain, value) => {
	const base = shape(parseNginx(await render(file, makeCtx(plain))));
	let got;
	try {
		got = shape(parseNginx(await render(file, makeCtx(value))));
	} catch {
		return false;
	}
	return JSON.stringify(got) === JSON.stringify(base);
};

// ---------------------------------------------------------------------------------------------
// Corpora. "injections" add or change directives when rendered unchecked; "rejected" are other
// values the rules refuse (they would break or confuse the config without injecting).
// ---------------------------------------------------------------------------------------------
const cases = {
	locationPath: {
		valid: [
			"/",
			"/api",
			"/api/",
			"= /exact",
			"~ \\.php$",
			"~* \\.(jpg|png|gif)$",
			"^~ /static/",
			'~ "^/v[0-9]{1,2}/"',
			'"/with space"',
			"/über",
			"/a$b",
			"/a\\;b",
		],
		injections: [
			"/x { return 200; } location /y",
			"/x {} include /etc/passwd; location /y",
			"/a; } server { listen 8080",
			"/a\nreturn 200 x;\nlocation /b",
			'"/a" { return 200; } location "/b"',
			"/a {",
		],
		rejected: ["", " /a", "/a b", "/a#", "/a\\", '"/a', '"/a\\"', "'/a'", "~", "~  /a\tb", "/a}", "/a\u0000"],
	},
	forwardHost: {
		valid: ["127.0.0.1", "backend", "my_service.internal", "10.0.0.1/path/", "backend/$1", "[::1]", "host:8080"],
		injections: [
			"a; return 200; #",
			'a"; return 200; set $x "',
			"a:80; } location /x { return 200",
			"a\nreturn 200;",
		],
		rejected: ["", "a b", "a'", "a{", "a}", "a#b", "a\\b", "$http_host", "a$b", "/path", "a/b c"],
	},
	forwardPath: {
		valid: ["", "/", "/x", "/x/$1/"],
		injections: ["/x; return 200", "/x\nreturn 200"],
		rejected: ["/x y", "/x#", "/x{", "/x\\"],
	},
	redirectDomain: {
		valid: [
			"example.com",
			"example.com:8443",
			"example.com/path",
			"sub.example.co.uk/a?b=c",
			"example.com/$1",
			"ab",
		],
		injections: ["example.com; return 200 x; #", "example.com;\nreturn 200", "a.com { return 200; }"],
		rejected: ["a b.com", "a.com#x", 'a.com"', "a.com\\", ".com", "a..b", "a", "a.com."],
	},
	streamHost: {
		valid: ["example.com", "1.2.3.4", "::1", "backend.internal"],
		injections: ["a.com:80; } server { listen 9999", "a.com;\nlisten 1"],
		rejected: ["a.com/x", "$host", "a b", "a.com#"],
	},
	domainName: {
		valid: ["example.com", "*.example.com", "xn--bcher-kva.example", "a-b.example"],
		injections: ["a.com\nreturn 200 x", "a.com\n} server {"],
		rejected: ["a\tb.com", "a;b", "a{b", "a b"],
	},
	clientAddress: {
		valid: ["192.168.0.1", "10.0.0.0/8", "all", "::1", "2001:db8::/32", "::ffff:192.168.1.1", "fe80::1"],
		injections: ["::1%x; allow all", "::1%x\nallow all", "1.2.3.4; allow all"],
		rejected: ["fe80::1%eth0", "s::1", "1.2.3.4/33", "::ffff:1d.1.1.1"],
	},
	accessUsername: {
		valid: ["admin", "john smith", "ü"],
		injections: [],
		rejected: ["a:b", "a\nroot:$apr1$x$y", "\u0000"],
	},
};

const checkers = {
	locationPath: (v) => isValid("locationPath", v),
	forwardHost: (v) => isValid("forwardHost", v),
	forwardPath: (v) => isValid("forwardPath", v),
	redirectDomain: (v) => isValid("redirectDomain", v),
	streamHost: isValidStreamHost,
	domainName: (v) => isValid("domainName", v),
	clientAddress: isValidClientAddress,
	accessUsername: (v) => isValid("accessUsername", v),
};

describe("nginx value rules", () => {
	for (const [name, { valid, injections, rejected }] of Object.entries(cases)) {
		it(`${name}: accepts valid values`, () => {
			for (const v of valid) assert.ok(checkers[name](v), `should accept ${JSON.stringify(v)}`);
		});
		it(`${name}: rejects injections and other unsafe values`, () => {
			for (const v of [...injections, ...rejected]) {
				assert.ok(!checkers[name](v), `should reject ${JSON.stringify(v)}`);
			}
		});
	}

	it("redirect domain rule matches the old rule for token-safe values", () => {
		const old = /^(?:[^.*]+\.?)+[^.]$/u;
		const corpus = [
			"ab",
			"a.b",
			"a.b.c",
			"a..b",
			".a",
			"a.",
			"a*",
			"a.*",
			"*a",
			"a*b",
			"a.b:80/x",
			"x",
			"ab.",
			"a.b.",
		];
		for (const v of corpus) {
			assert.equal(isValid("redirectDomain", v), old.test(v), `differs for ${JSON.stringify(v)}`);
		}
	});

	it("domain rules don't backtrack exponentially", () => {
		const evil = `${"a".repeat(30000)}.`;
		const start = process.hrtime.bigint();
		isValid("redirectDomain", evil);
		isValidStreamHost(evil);
		const ms = Number(process.hrtime.bigint() - start) / 1e6;
		assert.ok(ms < 1000, `took ${ms}ms`);
	});
});

describe("API request validation", async () => {
	await getCompiledSchema();

	const location = (o) => ({ path: "/api", forward_scheme: "http", forward_host: "backend", forward_port: 80, ...o });
	const proxyHost = (o) => ({
		domain_names: ["example.com"],
		forward_scheme: "http",
		forward_host: "backend",
		forward_port: 80,
		...o,
	});
	const redirection = (o) => ({
		domain_names: ["example.com"],
		forward_scheme: "http",
		forward_http_code: 301,
		forward_domain_name: "example.org",
		...o,
	});
	const stream = (o) => ({
		incoming_port: 9000,
		forwarding_host: "backend",
		forwarding_port: 80,
		tcp_forwarding: true,
		udp_forwarding: false,
		...o,
	});

	// [field, endpoint, method, payload builder]
	const endpoints = {
		locationPath: [
			["/nginx/proxy-hosts", "post", (v) => proxyHost({ locations: [location({ path: v })] })],
			["/nginx/proxy-hosts/{hostID}", "put", (v) => ({ locations: [location({ path: v })] })],
			["/nginx/proxy-hosts/test", "post", (v) => proxyHost({ locations: [location({ path: v })] })],
		],
		forwardHost: [
			["/nginx/proxy-hosts", "post", (v) => proxyHost({ forward_host: v })],
			["/nginx/proxy-hosts/{hostID}", "put", (v) => ({ forward_host: v })],
			["/nginx/proxy-hosts/{hostID}", "put", (v) => ({ locations: [location({ forward_host: v })] })],
			["/nginx/proxy-hosts/test", "post", (v) => proxyHost({ forward_host: v })],
			["/nginx/proxy-hosts/test", "post", (v) => proxyHost({ locations: [location({ forward_host: v })] })],
		],
		forwardPath: [
			["/nginx/proxy-hosts/{hostID}", "put", (v) => ({ locations: [location({ forward_path: v })] })],
			["/nginx/proxy-hosts/test", "post", (v) => proxyHost({ locations: [location({ forward_path: v })] })],
		],
		redirectDomain: [
			["/nginx/redirection-hosts", "post", (v) => redirection({ forward_domain_name: v })],
			["/nginx/redirection-hosts/{hostID}", "put", (v) => ({ forward_domain_name: v })],
			["/nginx/redirection-hosts/test", "post", (v) => redirection({ forward_domain_name: v })],
		],
		streamHost: [
			["/nginx/streams", "post", (v) => stream({ forwarding_host: v })],
			["/nginx/streams/{streamID}", "put", (v) => ({ forwarding_host: v })],
			["/nginx/streams/test", "post", (v) => stream({ forwarding_host: v })],
		],
		domainName: [
			["/nginx/proxy-hosts", "post", (v) => proxyHost({ domain_names: [v] })],
			["/nginx/redirection-hosts", "post", (v) => redirection({ domain_names: [v] })],
			["/nginx/dead-hosts", "post", (v) => ({ domain_names: [v] })],
			["/nginx/proxy-hosts/test", "post", (v) => proxyHost({ domain_names: [v] })],
			["/nginx/redirection-hosts/test", "post", (v) => redirection({ domain_names: [v] })],
			["/nginx/dead-hosts/test", "post", (v) => ({ domain_names: [v] })],
			["/nginx/certificates", "post", (v) => ({ provider: "letsencrypt", domain_names: [v] })],
		],
		clientAddress: [
			["/nginx/access-lists", "post", (v) => ({ name: "x", clients: [{ directive: "allow", address: v }] })],
			["/nginx/access-lists/{listID}", "put", (v) => ({ clients: [{ directive: "allow", address: v }] })],
		],
		accessUsername: [
			["/nginx/access-lists", "post", (v) => ({ name: "x", items: [{ username: v, password: "pw" }] })],
			["/nginx/access-lists/{listID}", "put", (v) => ({ items: [{ username: v, password: "pw" }] })],
		],
	};

	const validate = (path, method, payload) => {
		const schema = getValidationSchema(path, method);
		assert.ok(schema, `no request schema for ${method} ${path}`);
		return apiValidator(schema, payload);
	};

	for (const [name, list] of Object.entries(endpoints)) {
		for (const [path, method, build] of list) {
			it(`${method.toUpperCase()} ${path} ${name}: rejects injections`, async () => {
				for (const v of [...cases[name].injections, ...cases[name].rejected]) {
					if (v === "") continue; // minLength cases, covered by the rules above
					await assert.rejects(validate(path, method, build(v)), /must/, `accepted ${JSON.stringify(v)}`);
				}
			});
			it(`${method.toUpperCase()} ${path} ${name}: accepts valid values`, async () => {
				for (const v of cases[name].valid) {
					if (name === "forwardHost" && v === "") continue;
					await validate(path, method, build(v));
				}
			});
		}
	}

	it("schema patterns are the ones the render-time check uses", async () => {
		const s = await getCompiledSchema();
		const body = (path, method) => s.paths[path][method].requestBody.content["application/json"].schema;
		const ph = body("/nginx/proxy-hosts", "post").properties;
		const loc = ph.locations.items.properties;
		const al = body("/nginx/access-lists", "post").properties;
		assert.equal(ph.domain_names.items.pattern, patterns.domainName);
		assert.equal(body("/nginx/certificates", "post").properties.domain_names.items.pattern, patterns.domainName);
		assert.equal(ph.forward_host.pattern, patterns.forwardHost);
		assert.equal(loc.path.pattern, patterns.locationPath);
		assert.equal(loc.forward_host.pattern, patterns.forwardHost);
		assert.equal(loc.forward_path.pattern, patterns.forwardPath);
		assert.equal(
			body("/nginx/redirection-hosts", "post").properties.forward_domain_name.pattern,
			patterns.redirectDomain,
		);
		assert.equal(body("/nginx/streams", "post").properties.forwarding_host.anyOf[0].pattern, patterns.streamDomain);
		assert.equal(al.clients.items.properties.address.oneOf[1].pattern, patterns.clientIpv6);
		assert.equal(al.items.items.properties.username.pattern, patterns.accessUsername);
	});
});

describe("rendered templates", () => {
	const locationCtx = (field) => (v) => ({
		path: "/api",
		forward_scheme: "http",
		forward_host: "backend",
		forward_port: 8080,
		forward_path: "",
		advanced_config: "",
		access_list_id: 0,
		[field]: v,
	});
	const proxyCtx = (field) => (v) => ({
		enabled: true,
		id: 1,
		domain_names: ["example.com"],
		forward_scheme: "http",
		forward_host: "backend",
		forward_port: 80,
		certificate_id: 0,
		locations: "",
		advanced_config: "",
		use_default_location: true,
		ipv6: true,
		[field]: v,
	});
	const redirectCtx = (v) => ({
		enabled: true,
		id: 1,
		domain_names: ["example.com"],
		forward_scheme: "http",
		forward_http_code: 301,
		forward_domain_name: v,
		preserve_path: true,
		advanced_config: "",
		use_default_location: true,
		ipv6: true,
	});
	const streamCtx = (v) => ({
		enabled: true,
		id: 1,
		incoming_port: 9000,
		forwarding_host: v,
		forwarding_port: 80,
		tcp_forwarding: true,
		udp_forwarding: true,
		ipv6: true,
	});
	const accessCtx = (v) => ({
		access_list_id: 1,
		access_list: { items: [], clients: [{ directive: "allow", address: v }], satisfy_any: false },
	});

	// A location modifier is a separate argument, so compare with a plain path using the same one
	const plainPath = (v) => {
		const m = v.match(/^(=|~\*?|\^~) +/);
		return m ? `${m[1]} /api` : "/api";
	};

	// [template, context builder, plain value (or builder), injections that apply to it]
	const targets = {
		locationPath: [["_location.conf", locationCtx("path"), plainPath]],
		forwardHost: [
			["_location.conf", locationCtx("forward_host"), "backend"],
			// Rendered inside double quotes here, so only a quote can break out
			["proxy_host.conf", proxyCtx("forward_host"), "backend", ['a"; return 200; set $x "', 'a" ; } server { "']],
		],
		forwardPath: [["_location.conf", locationCtx("forward_path"), "/x"]],
		redirectDomain: [["redirection_host.conf", redirectCtx, "example.org"]],
		streamHost: [["stream.conf", streamCtx, "backend"]],
		domainName: [["proxy_host.conf", (v) => proxyCtx("domain_names")([v]), "example.com"]],
		clientAddress: [["_access.conf", accessCtx, "10.0.0.1"]],
	};

	for (const [name, list] of Object.entries(targets)) {
		for (const [file, ctx, plain, injections = cases[name].injections] of list) {
			const plainFor = (v) => (typeof plain === "function" ? plain(v) : plain);
			it(`${file} ${name}: accepted values keep the statement structure`, async () => {
				for (const v of cases[name].valid) {
					if (v === "" && name !== "forwardPath") continue;
					// generateConfig brackets IPv6 stream hosts before rendering
					const value = name === "streamHost" && v.includes(":") ? `[${v}]` : v;
					assert.ok(
						await sameShapeAs(file, ctx, plainFor(v), value),
						`${JSON.stringify(v)} changed the config`,
					);
				}
			});
			it(`${file} ${name}: the injection corpus would change it unchecked`, async () => {
				assert.ok(injections.length > 0);
				for (const v of injections) {
					assert.ok(!checkers[name](v), `rules accept ${JSON.stringify(v)}`);
					assert.ok(
						!(await sameShapeAs(file, ctx, plainFor(v), v)),
						`${JSON.stringify(v)} is not an injection`,
					);
				}
			});
		}
	}

	it("location path renders as the location's own arguments", async () => {
		for (const v of cases.locationPath.valid) {
			const loc = find(parseNginx(await render("_location.conf", locationCtx("path")(v))), "location");
			assert.equal(loc.args.join(" "), v.replace(/ +/, " "));
		}
	});
});

describe("render-time check (rows saved before validation)", () => {
	const host = (o) => ({
		id: 7,
		domain_names: ["example.com"],
		forward_host: "backend",
		locations: [],
		...o,
	});

	it("passes valid hosts", () => {
		assertHostRenderable("proxy_host", host({ locations: [{ path: "~* \\.php$", forward_host: "10.0.0.1/x/" }] }));
		assertHostRenderable("redirection_host", host({ forward_domain_name: "example.org/path" }));
		assertHostRenderable("dead_host", host({}));
		assertHostRenderable("stream", { id: 1, forwarding_host: "::1" });
		assertHostRenderable(
			"proxy_host",
			host({ access_list: { clients: [{ directive: "allow", address: "10.0.0.0/8" }] } }),
		);
	});

	it("still renders stored values the API no longer accepts but that can't add directives", () => {
		// e.g. an IPv6 literal server name, as the host-header smoke test renders
		assertHostRenderable("proxy_host", host({ domain_names: ["host.example.test", "[::1]"] }));
		assertHostRenderable("proxy_host", host({ forward_host: "$upstream" }));
		assertHostRenderable("redirection_host", host({ forward_domain_name: "a" }));
		assertHostRenderable("stream", { id: 1, forwarding_host: "a.com/x" });
	});

	const refuse = (type, row, what) => {
		assert.throws(
			() => assertHostRenderable(type, row),
			(err) => err.unsafeNginxValue === true && err.message.includes(what),
		);
	};

	it("refuses every injected field", () => {
		for (const v of cases.locationPath.injections) {
			refuse("proxy_host", host({ locations: [{ path: v, forward_host: "b" }] }), "location path");
		}
		for (const v of cases.forwardHost.injections) {
			refuse("proxy_host", host({ forward_host: v }), "forward host");
			refuse("proxy_host", host({ locations: [{ path: "/a", forward_host: v }] }), "location forward host");
		}
		for (const v of cases.forwardPath.injections) {
			refuse(
				"proxy_host",
				host({ locations: [{ path: "/a", forward_host: "b", forward_path: v }] }),
				"forward path",
			);
		}
		for (const v of cases.redirectDomain.injections) {
			refuse("redirection_host", host({ forward_domain_name: v }), "forward domain");
		}
		for (const v of cases.streamHost.injections) {
			refuse("stream", { id: 1, forwarding_host: v }, "forwarding host");
		}
		for (const v of cases.domainName.injections) {
			refuse("dead_host", host({ domain_names: [v] }), "domain name");
		}
		for (const v of cases.clientAddress.injections) {
			refuse("proxy_host", host({ access_list: { clients: [{ directive: "allow", address: v }] } }), "address");
		}
	});
});
