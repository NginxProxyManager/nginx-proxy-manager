/**
 * The values the API accepts for a custom location (lib/nginx-values.js) rendered through the custom location
 * renderer (lib/nginx-locations.js: _location.conf, _location_body.conf, _location_assets.conf) in every mode.
 *
 * nginx-values.test.js renders them through _location.conf with a plain context only. The dynamic rendering also
 * writes the path and the forward path into `rewrite` and `proxy_redirect` arguments, and "Cache Assets" repeats
 * the location in a nested asset location, so each accepted value must keep the statement structure there too.
 * Statements are read with lib/nginx-tokenize.js, which follows nginx's own tokenizer.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseLocationMode, parseLocationPath, prepareLocation, readLocationTemplate, renderLocation } from "../lib/nginx-locations.js";
import { scanNginxConfig } from "../lib/nginx-tokenize.js";
import { isValid } from "../lib/nginx-values.js";
import utils from "../lib/utils.js";

const engine = utils.getRenderEngine();
const template = readLocationTemplate();

// The valid corpus of nginx-values.test.js, plus escapes the location path rule accepts
const valid = {
	locationPath: [
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
		"/a\\\\b",
		'"/a\\"b"',
		"^~ /a\\{b",
		"@named",
	],
	forwardHost: ["127.0.0.1", "backend", "my_service.internal", "10.0.0.1/path/", "backend/$1", "[::1]", "host:8080"],
	forwardPath: ["", "/", "/x", "/x/$1/"],
};

const hostFields = {
	access_list_id: 0,
	certificate_id: 0,
	ssl_forced: false,
	block_exploits: false,
	allow_websocket_upgrade: false,
	http2_support: false,
	hsts_enabled: false,
	hsts_subdomains: false,
	access_list: null,
	certificate: null,
};

const base = {
	path: "/api",
	forward_scheme: "http",
	forward_host: "backend",
	forward_port: 8080,
	forward_path: "/x",
	advanced_config: "",
};

// Rendered as generateConfig() does it: prepareLocation(), then the mode the DNS check would pick, adjusted by
// chooseLocationMode() (variable forward paths stay static)
const renderIn = (mode, caching, location) => {
	const loc = Object.assign({}, hostFields, { caching_enabled: caching }, prepareLocation(location));
	const chosen = chooseLocationMode(loc, { mode, status: "ok" });
	return renderLocation(engine, template, loc, { index: 0, status: "ok", mode: chosen.mode });
};

// Statement names, argument counts and block depth; the values themselves don't matter
const shape = (text) => {
	const scanned = scanNginxConfig(text);
	assert.deepEqual(scanned.errors, [], `nginx would not read:\n${text}`);
	assert.ok(scanned.balanced, `unbalanced:\n${text}`);
	return scanned.statements.map((s) => `${s.depth}:${s.tokens[0]}/${s.tokens.length}${s.end}`);
};

// A plain value rendered the same way: same modifier, same "has a forward path", same "has a variable"
const plain = {
	locationPath: (v) => {
		const parsed = parseLocationPath(v);
		if (parsed.isNamed) return "@plain";
		return parsed.modifier ? `${parsed.modifier} /plain` : "/plain";
	},
	forwardHost: (v) => {
		const i = v.indexOf("/");
		if (i === -1) return "plain";
		return /\$/.test(v.slice(i)) ? "plain/$1" : "plain/p";
	},
	forwardPath: (v) => {
		if (v === "") return "";
		return /\$/.test(v) ? "/p/$1" : "/p";
	},
};

const field = { locationPath: "path", forwardHost: "forward_host", forwardPath: "forward_path" };

const modes = [
	["static", false],
	["dynamic", false],
	["static", true],
	["dynamic", true],
];

describe("accepted location values through the location renderer", () => {
	it("the corpus is accepted by the API rules", () => {
		for (const [name, values] of Object.entries(valid)) {
			for (const v of values) {
				if (v === "" && name === "forwardPath") continue;
				assert.ok(isValid(name, v), `${name} ${JSON.stringify(v)}`);
			}
		}
	});

	for (const [name, values] of Object.entries(valid)) {
		for (const [mode, caching] of modes) {
			it(`${name} keeps the statement structure (${mode}${caching ? ", cache assets" : ""})`, async () => {
				for (const v of values) {
					const location = { ...base, [field[name]]: v };
					// nginx rejects a URI part in the proxy_pass of a regex or named location; preflightLocation()
					// quarantines those, so they are rendered without one
					if (name === "locationPath") {
						const parsed = parseLocationPath(v);
						if (parsed.isRegex || parsed.isNamed) location.forward_path = "";
					}
					const want = shape(await renderIn(mode, caching, { ...location, [field[name]]: plain[name](v) }));
					const got = shape(await renderIn(mode, caching, location));
					assert.deepEqual(got, want, `${JSON.stringify(v)} changed the config`);
				}
			});
		}
	}

	it("the location's own arguments are the path, in every mode", async () => {
		for (const [mode, caching] of modes) {
			for (const v of valid.locationPath) {
				const location = { ...base, path: v };
				const parsed = parseLocationPath(v);
				if (parsed.isRegex || parsed.isNamed) location.forward_path = "";
				const scanned = scanNginxConfig(await renderIn(mode, caching, location));
				const own = scanned.statements.find((s) => s.tokens[0] === "location" && s.depth === 0);
				const want = scanNginxConfig(`location ${v} {}`).statements[0].tokens;
				assert.deepEqual(own.tokens, want, `${mode} ${caching} ${JSON.stringify(v)}`);
			}
		}
	});

	it("the dynamic rewrite matches the URI nginx reads from an escaped path", async () => {
		for (const [path, uri] of [
			["/a\\;b", "/a\\;b/x"],
			["/a\\\\b", "/a\\b/x"],
			['"/a\\"b"', '/a"b/x'],
			['"/with space"', "/with space/x"],
			["/h.v1+(p)", "/h.v1+(p)/x"],
		]) {
			const out = await renderIn("dynamic", false, { ...base, path });
			const rewrite = scanNginxConfig(out).statements.find((s) => s.tokens[0] === "rewrite");
			assert.ok(rewrite, out);
			const m = rewrite.tokens[1].match(/^\(\?s\)(.*)$/s);
			const re = new RegExp(m[1], "s");
			assert.equal(uri.replace(re, rewrite.tokens[2]), "/x/x", `${path}: ${rewrite.tokens[1]}`);
		}
	});
});
