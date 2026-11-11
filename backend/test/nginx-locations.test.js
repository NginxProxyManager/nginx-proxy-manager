import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	assetAdvancedConfig,
	bracesBalanced,
	chooseLocationMode,
	describeConfigLine,
	escapeRegex,
	findDuplicatePath,
	hasVariablePath,
	isVariableHost,
	locationMessage,
	MESSAGE_CODES,
	MESSAGES,
	matchSavedLocations,
	normaliseLocationPath,
	parseLocationPath,
	preflightLocation,
	prepareLocation,
	publicLocationState,
	readLocationTemplate,
	renderLocation,
} from "../lib/nginx-locations.js";
import utils from "../lib/utils.js";

const engine = utils.getRenderEngine();
const template = readLocationTemplate();

const hostDefaults = {
	access_list_id: 0,
	certificate_id: 0,
	ssl_forced: false,
	caching_enabled: false,
	block_exploits: false,
	allow_websocket_upgrade: false,
	http2_support: false,
	hsts_enabled: false,
	hsts_subdomains: false,
	access_list: null,
	certificate: null,
};

const render = (location, state, host = {}) => {
	const loc = Object.assign({}, hostDefaults, host, prepareLocation(location));
	return renderLocation(engine, template, loc, Object.assign({ index: 0, status: "ok", stub: true }, state));
};

const base = { forward_scheme: "http", forward_host: "app", forward_port: 8080 };

describe("parseLocationPath", () => {
	it("splits modifiers", () => {
		assert.deepEqual(
			[parseLocationPath("/a"), parseLocationPath("= /x"), parseLocationPath("^~ /p/"), parseLocationPath("~* \\.php$")].map(
				(p) => [p.modifier, p.uri, p.isRegex],
			),
			[
				["", "/a", false],
				["=", "/x", false],
				["^~", "/p/", false],
				["~*", "\\.php$", true],
			],
		);
	});

	it("knows named locations", () => {
		assert.equal(parseLocationPath("@fallback").isNamed, true);
	});

	it("unquotes quoted paths", () => {
		assert.equal(parseLocationPath('"/my path"').unquoted, "/my path");
		assert.equal(parseLocationPath("^~ '/a b/'").unquoted, "/a b/");
		assert.equal(parseLocationPath("/plain").unquoted, "/plain");
	});

	it("normalises whitespace", () => {
		assert.equal(normaliseLocationPath("  ^~   /x "), "^~ /x");
		assert.equal(normaliseLocationPath("=/x"), "= /x");
	});
});

describe("findDuplicatePath", () => {
	it("finds duplicates after normalisation", () => {
		assert.equal(findDuplicatePath([{ path: "/a" }, { path: " /a " }]), "/a");
		assert.equal(findDuplicatePath([{ path: "^~ /a" }, { path: "^~  /a" }]), "^~ /a");
	});

	it("keeps different modifiers apart", () => {
		assert.equal(findDuplicatePath([{ path: "/a" }, { path: "= /a" }]), null);
		assert.equal(findDuplicatePath([]), null);
		assert.equal(findDuplicatePath(undefined), null);
	});

	it("treats a prefix and a ^~ prefix with the same uri as duplicates, like nginx", () => {
		assert.equal(findDuplicatePath([{ path: "/a" }, { path: "^~ /a" }]), "^~ /a");
		assert.equal(findDuplicatePath([{ path: "= /x" }, { path: "=/x" }]), "= /x");
		assert.equal(findDuplicatePath([{ path: '"/my path"' }, { path: '"/my path"' }]), '"/my path"');
	});

	it("allows duplicate regex and named locations, nginx accepts them", () => {
		assert.equal(findDuplicatePath([{ path: "~* \\.php$" }, { path: "~* \\.php$" }]), null);
		assert.equal(findDuplicatePath([{ path: "~ ^/api" }, { path: "~ ^/api" }]), null);
		assert.equal(findDuplicatePath([{ path: "@fallback" }, { path: "@fallback" }]), null);
	});
});

describe("matchSavedLocations", () => {
	it("matches by the trimmed path", () => {
		const saved = [{ path: " /api ", advanced_config: "a" }, { path: "/b" }];
		const match = matchSavedLocations([{ path: "/b" }, { path: "/api" }, { path: "/new" }], saved);
		assert.deepEqual(match, [saved[1], saved[0], undefined]);
	});

	it("matches a repeated path by its occurrence", () => {
		const saved = [
			{ path: "~ ^/x", advanced_config: "first" },
			{ path: "/y" },
			{ path: "~ ^/x", advanced_config: "second" },
		];
		const match = matchSavedLocations([{ path: "~ ^/x" }, { path: "~ ^/x" }, { path: "~ ^/x" }], saved);
		assert.deepEqual(match, [saved[0], saved[2], undefined]);
	});

	it("copes with hosts without locations", () => {
		assert.deepEqual(matchSavedLocations([{ path: "/a" }], null), [undefined]);
		assert.deepEqual(matchSavedLocations(undefined, []), []);
	});
});

describe("escapeRegex", () => {
	it("escapes regex metacharacters", () => {
		assert.equal(escapeRegex("/h.v1+(p)"), "\\/h\\.v1\\+\\(p\\)");
	});
});

describe("prepareLocation", () => {
	it("trims input", () => {
		const loc = prepareLocation({ path: " /a ", forward_host: " app ", forward_path: " /x " });
		assert.equal(loc.path, "/a");
		assert.equal(loc.forward_host, "app");
		assert.equal(loc.forward_path, "/x");
	});

	it("splits host/path, the path in the host wins as it always did", () => {
		const loc = prepareLocation({ path: "/a", forward_host: "app/sub/dir", forward_path: "/ignored" });
		assert.equal(loc.forward_host, "app");
		assert.equal(loc.forward_path, "/sub/dir");
	});

	it("brackets IPv6 literals", () => {
		assert.equal(prepareLocation({ path: "/", forward_host: "fd00::1" }).forward_host, "[fd00::1]");
	});

	it("makes the forward path absolute", () => {
		assert.equal(prepareLocation({ path: "/", forward_host: "a", forward_path: "x" }).forward_path, "/x");
	});
});

describe("preflightLocation", () => {
	it("passes a normal location", () => {
		assert.equal(preflightLocation(prepareLocation({ ...base, path: "/a" })), null);
	});

	it("reports disabled locations", () => {
		assert.deepEqual(preflightLocation(prepareLocation({ ...base, path: "/a", enabled: false })), {
			status: "disabled",
			code: null,
			params: null,
			message: null,
		});
	});

	it("quarantines regex and named locations with a literal forward path, nginx -t rejects that URI", () => {
		const res = preflightLocation(prepareLocation({ ...base, path: "~ ^/x", forward_path: "/y" }));
		assert.deepEqual(res, {
			status: "quarantined",
			code: "regex_forward_path",
			params: null,
			message: MESSAGES.regexWithForwardPath,
		});
		assert.deepEqual(preflightLocation(prepareLocation({ ...base, path: "~* ^/x", forward_host: "app/v1/" })), {
			status: "quarantined",
			code: "regex_forward_path",
			params: null,
			message: MESSAGES.regexWithForwardPath,
		});
		assert.deepEqual(preflightLocation(prepareLocation({ ...base, path: "@fb", forward_path: "/y" })), {
			status: "quarantined",
			code: "named_forward_path",
			params: null,
			message: MESSAGES.namedWithForwardPath,
		});
	});

	it("allows regex and named locations whose forward path has a variable, like before", () => {
		for (const loc of [
			{ path: "~ ^/api/(.*)$", forward_path: "/v1/$1" },
			{ path: "~* ^/a/(?<rest>.*)$", forward_path: "/$" + "{rest}" },
			{ path: "~ ^/b/", forward_host: "app/v1$request_uri" },
			{ path: "@fb", forward_path: "/p/$request_uri" },
		]) {
			assert.equal(preflightLocation(prepareLocation({ ...base, ...loc })), null, JSON.stringify(loc));
		}
	});

	it("allows regex and named locations with a variable forward host and a literal forward path, like before", async () => {
		for (const loc of [
			{ path: "~ ^/api/", forward_host: "$backend", forward_path: "/v1/" },
			{ path: "~* \\.php$", forward_host: "$backend/v1/" },
			{ path: "@fb", forward_host: "$backend", forward_path: "/fallback/" },
		]) {
			assert.equal(preflightLocation(prepareLocation({ ...base, ...loc })), null, JSON.stringify(loc));
		}
		// still quarantined with a literal host
		assert.equal(
			preflightLocation(prepareLocation({ ...base, path: "~ ^/api/", forward_path: "/v1/" })).message,
			MESSAGES.regexWithForwardPath,
		);
		const loc = { ...base, path: "~ ^/api/", forward_host: "$backend", forward_path: "/v1/", advanced_config: "set $backend app;" };
		const mode = chooseLocationMode(prepareLocation(loc), { mode: "dynamic", status: "ok" });
		assert.deepEqual(mode, { mode: "static", status: "ok" });
		const out = await render(loc, mode);
		assert.match(out, /proxy_pass\s+http:\/\/\$backend:8080\/v1\/;/);
		assert.doesNotMatch(out, /rewrite|return 503/);
	});

	it("quarantines invalid host names", () => {
		for (const host of ["a b", "a;b", 'a"b', "a{", "$x y", "a$x", "$x;", "$" + "{x}", "#x"]) {
			const res = preflightLocation(prepareLocation({ ...base, path: "/a", forward_host: host }));
			assert.equal(res.status, "quarantined", host);
			assert.equal(res.code, "invalid_host", host);
			assert.equal(res.message, MESSAGES.invalidHost, host);
		}
	});

	it("allows a forward host that is a single nginx variable", () => {
		for (const host of ["$backend", "$server", "$x_1", "$backend/sub"]) {
			assert.equal(preflightLocation(prepareLocation({ ...base, path: "/a", forward_host: host })), null, host);
		}
		assert.equal(isVariableHost("$backend"), true);
		assert.equal(isVariableHost("$1x"), false);
		assert.equal(isVariableHost("app"), false);
	});

	it("quarantines forward paths that would break the proxy_pass / rewrite directive", () => {
		const cases = [
			{ forward_host: "app/x;y" },
			{ forward_host: "app/a}" },
			{ forward_host: "app/{a" },
			{ forward_host: "app/#x" },
			{ forward_host: 'app/"q' },
			{ forward_host: "app/'q" },
			{ forward_host: "app/a`b" },
			{ forward_host: "app/a\\b" },
			{ forward_host: "app/a b" },
			{ forward_host: "app", forward_path: "/x;return 200" },
			{ forward_host: "app", forward_path: "/a\tb" },
			{ forward_host: "$backend/x;y" },
		];
		for (const loc of cases) {
			const res = preflightLocation(prepareLocation({ ...base, path: "/a", ...loc }));
			assert.deepEqual(
				res,
				{ status: "quarantined", code: "invalid_path", params: null, message: MESSAGES.invalidPath },
				JSON.stringify(loc),
			);
		}
	});

	it("allows forward paths with nginx variables", () => {
		for (const loc of [
			{ forward_host: "app/api/$1" },
			{ forward_host: "app", forward_path: "/api/$host/x" },
			{ forward_host: "app", forward_path: "/api/$" + "{host}x" },
			{ forward_host: "$backend/sub/$1" },
			{ forward_host: "app", forward_path: "/a-b_c.d~e%20f?x=1&y=2" },
		]) {
			assert.equal(preflightLocation(prepareLocation({ ...base, path: "/a", ...loc })), null, JSON.stringify(loc));
		}
	});

	it("quarantines unbalanced advanced config", () => {
		const res = preflightLocation(prepareLocation({ ...base, path: "/a", advanced_config: "if ($x) {" }));
		assert.equal(res.message, MESSAGES.unbalancedBraces);
		assert.equal(res.code, "unbalanced_braces");
	});

	it("reports an empty path or forward host by code", () => {
		assert.equal(preflightLocation(prepareLocation({ ...base, path: " " })).code, "empty_path");
		assert.equal(preflightLocation(prepareLocation({ ...base, path: "/a", forward_host: "" })).code, "empty_host");
		assert.equal(preflightLocation(prepareLocation({ ...base, path: "/a", forward_host: "" })).message, MESSAGES.emptyHost);
	});
});

describe("bracesBalanced", () => {
	it("ignores comments and strings", () => {
		assert.equal(bracesBalanced('add_header X "{"; # }\nlocation /x { }'), true);
		assert.equal(bracesBalanced("}"), false);
		assert.equal(bracesBalanced("{"), false);
		assert.equal(bracesBalanced(""), true);
	});

	it("only starts comments and strings at the start of a token, like nginx", () => {
		// all of these pass nginx -t
		for (const text of [
			"if ($uri = /x/old) { return 301 /#/new; }",
			"location /x/y { return 301 https://$host/#/y; }",
			"if ($http_x) { add_header X-A don't; }",
			"if ($http_x) { add_header X-A it's; add_header X-B \"#\"; }",
			"set $a $" + "{host}x; if ($a) { return 200; }",
			"location /a { return 200 'x}'; } # }",
		]) {
			assert.equal(bracesBalanced(text), true, text);
		}
	});

	it("reads *_by_lua_block bodies as Lua, like lua-nginx-module", () => {
		// valid OpenResty blocks, they pass nginx -t
		for (const text of [
			'access_by_lua_block {\n  -- deny unless header }\n  if ngx.var.http_x_token ~= "secret" then return ngx.exit(403) end\n}',
			"rewrite_by_lua_block {\n  local t = {1}\n  if #t ~= 1 then return ngx.exit(500) end -- {\n}",
			'content_by_lua_block { ngx.say("}", \'{\', [[}]], [==[ ]] } ]==]) --[[ } ]] }',
		]) {
			assert.equal(bracesBalanced(text), true, text);
		}
		assert.equal(bracesBalanced("access_by_lua_block { --[[ } }"), false);
		assert.equal(bracesBalanced("access_by_lua_block { # }\n"), true);
	});

	it("still finds real brace errors", () => {
		for (const text of ["if ($x) { return 200; # }", "if ($x) { return 200; ", "return 200; }", "if ($x) { add_header 'a; }"]) {
			assert.equal(bracesBalanced(text), false, text);
		}
	});
});

describe("renderLocation", () => {
	it("renders static locations like before", async () => {
		const out = await render({ ...base, path: "/a", forward_path: "/x" }, { mode: "static" });
		assert.match(out, /# npm-location-begin 0\n/);
		assert.match(out, /# npm-location-end 0\n$/);
		assert.match(out, /proxy_pass\s+http:\/\/app:8080\/x;/);
		assert.doesNotMatch(out, /\$npm_loc_0_host/);
		assert.doesNotMatch(out, /proxy_redirect/);
	});

	it("renders dynamic locations with set, rewrite, proxy_pass and proxy_redirect", async () => {
		const out = await render({ ...base, path: "/a", forward_path: "/x" }, { mode: "dynamic" });
		assert.match(out, /set \$npm_loc_0_host "app";/);
		assert.match(out, /rewrite\s+"\(\?s\)\^\\\/a\(\.\*\)\$" \/x\$1 break;/);
		assert.match(out, /proxy_pass\s+http:\/\/\$npm_loc_0_host:8080;/);
		assert.match(out, /proxy_redirect\s+http:\/\/app:8080\/x \/a;/);
		// set must come before the advanced config
		assert.ok(out.indexOf("set $npm_loc_0_host") < out.indexOf("# npm-location-advanced-begin 0"));
	});

	it("does not rewrite without a forward path", async () => {
		const out = await render({ ...base, path: "/a" }, { mode: "dynamic", index: 3 });
		assert.doesNotMatch(out, /rewrite/);
		assert.match(out, /proxy_redirect\s+http:\/\/app:8080\/ \/;/);
		assert.match(out, /\$npm_loc_3_host/);
	});

	it("uses the uri without modifier", async () => {
		const out = await render({ ...base, path: "^~ /pre/", forward_path: "/q/" }, { mode: "dynamic" });
		assert.match(out, /rewrite\s+"\(\?s\)\^\\\/pre\\\/\(\.\*\)\$" \/q\/\$1 break;/);
		assert.match(out, /proxy_redirect\s+http:\/\/app:8080\/q\/ \/pre\/;/);
	});

	it("leaves proxy_redirect to the user when the advanced config has one", async () => {
		const out = await render(
			{ ...base, path: "/a", advanced_config: "proxy_redirect off;" },
			{ mode: "dynamic" },
		);
		assert.equal(out.match(/proxy_redirect/g).length, 1);
	});

	it("leaves proxy_redirect to the user's rule in the nested asset location too", async () => {
		const cases = [
			{ mode: "static", forward_path: "/x" },
			{ mode: "dynamic", forward_path: "/x" },
			{ mode: "static", forward_path: "/api/$arg_id" },
		];
		for (const rule of ["proxy_redirect off;", "proxy_redirect http://app:8080/ /;"]) {
			for (const { mode, forward_path } of cases) {
				const out = await render(
					{ ...base, path: "/a/", forward_path, advanced_config: rule },
					{ mode },
					{ caching_enabled: true },
				);
				const nested = out.slice(out.indexOf("location ~*"));
				assert.notEqual(out.indexOf("location ~*"), -1, `${mode} ${forward_path}`);
				assert.match(nested, /proxy_cache public-cache;/);
				// only the user's line, in the location and in its copy of the advanced config in the nested block
				assert.equal(out.match(/proxy_redirect/g).length, 2, `${rule} ${mode} ${forward_path}`);
				assert.equal(nested.match(/proxy_redirect/g).length, 1, `${rule} ${mode} ${forward_path}`);
				assert.ok(nested.includes(rule), `${rule} ${mode} ${forward_path}`);
			}
		}
	});

	it("renders IPv6 upstreams with brackets", async () => {
		const out = await render({ ...base, path: "/a", forward_host: "fd00::1" }, { mode: "static" });
		assert.match(out, /proxy_pass\s+http:\/\/\[fd00::1\]:8080;/);
	});

	it("renders a stub for quarantined locations", async () => {
		const out = await render({ ...base, path: "/a" }, { status: "quarantined", stub: true });
		assert.match(out, /location \/a \{\n\s+# npm: quarantined.*\n\s+return 503;\n\s+\}/);
		assert.match(out, /# npm-location-begin 0/);
	});

	it("omits a quarantined location when the stub failed too", async () => {
		const out = await render({ ...base, path: "/a" }, { status: "quarantined", stub: false });
		assert.doesNotMatch(out, /location \/a/);
		assert.match(out, /quarantined, not rendered/);
	});

	it("does not render disabled locations", async () => {
		const out = await render({ ...base, path: "/a" }, { status: "disabled", index: 2 });
		assert.equal(out.trim(), "# npm-location 2 disabled by user");
	});

	it("renders the asset cache inline against the location's own upstream", async () => {
		for (const mode of ["static", "dynamic"]) {
			const out = await render({ ...base, path: "/a", forward_path: "/x" }, { mode }, { caching_enabled: true });
			assert.doesNotMatch(out, /include conf\.d\/include\/assets\.conf/);
			assert.doesNotMatch(out, /\$server/);
			const nested = out.slice(out.indexOf("location ~*"));
			assert.match(nested, /proxy_cache public-cache;/);
			// keyed by the forwarded Host with the client's port, like conf.d/include/assets.conf
			assert.match(nested, /proxy_cache_key \$forward_host\$request_uri;/);
			assert.doesNotMatch(out, /proxy_cache_key \$host/);
			// the nested location repeats the parent's headers (Host $forward_host)
			assert.match(out.slice(0, out.indexOf("location ~*")), /proxy_set_header Host \$forward_host;/);
			assert.match(nested, /proxy_set_header Host \$forward_host;/);
			assert.match(nested, /rewrite "\(\?s\)\^\\\/a\(\.\*\)\$" \/x\$1 break;/);
			assert.match(nested, /proxy_redirect http:\/\/app:8080\/x \/a;/);
			if (mode === "dynamic") {
				assert.match(nested, /set \$npm_loc_0_host "app";/);
				assert.match(nested, /proxy_pass http:\/\/\$npm_loc_0_host:8080;/);
			} else {
				assert.match(nested, /proxy_pass http:\/\/app:8080;/);
			}
		}
	});

	it("quotes the rewrite of a quoted path, so it stays one argument", async () => {
		const out = await render({ ...base, path: '"/my path"', forward_path: "/fp" }, { mode: "dynamic" });
		assert.match(out, /location "\/my path" \{/);
		assert.match(out, /rewrite\s+"\(\?s\)\^\\\/my path\(\.\*\)\$" \/fp\$1 break;/);
		assert.match(out, /proxy_redirect\s+http:\/\/app:8080\/fp "\/my path";/);
	});

	it("renders a variable forward host literally, as it always was", async () => {
		const loc = { ...base, path: "/x", forward_host: "$backend", forward_path: "/fp", advanced_config: "set $backend app;" };
		const mode = chooseLocationMode(prepareLocation(loc), { mode: "dynamic", status: "unresolved" });
		assert.deepEqual(mode, { mode: "static", status: "ok" });
		const out = await render(loc, mode, { caching_enabled: true });
		const parent = out.slice(0, out.indexOf("location ~*"));
		assert.match(parent, /proxy_pass\s+http:\/\/\$backend:8080\/fp;/);
		assert.doesNotMatch(out, /^\s*rewrite |npm_loc_0_host/m);
		assert.doesNotMatch(parent, /proxy_redirect/);
		// the nested asset location repeats the parent's advanced config (`set $backend`) and its proxy_pass, as it is
		const nested = out.slice(out.indexOf("location ~*"));
		assert.match(nested, /proxy_cache public-cache;/);
		assert.match(nested, /set \$backend app;[\s\S]*proxy_pass http:\/\/\$backend:8080\/fp;/);
		assert.match(nested, /proxy_redirect off;/);
	});

	it("renders a forward path with an nginx variable without rewrite, like before", async () => {
		const loc = { ...base, path: "/a/", forward_path: "/api/$arg_id" };
		const mode = chooseLocationMode(prepareLocation(loc), { mode: "dynamic", status: "ok" });
		const out = await render(loc, mode);
		assert.match(out, /proxy_pass\s+http:\/\/app:8080\/api\/\$arg_id;/);
		assert.doesNotMatch(out, /rewrite|npm_loc_0_host|proxy_redirect/);
	});

	it("repeats the advanced config's set in the nested asset location of a variable forward path", async () => {
		// without the nested location the host-level asset regex takes the assets to the host's main upstream,
		// without the `set` the nested location would send them to /v1/ instead of /v1/t
		const loc = { ...base, path: "/a/", forward_path: "/v1/$target", advanced_config: "set $target t;" };
		const mode = chooseLocationMode(prepareLocation(loc), { mode: "dynamic", status: "ok" });
		assert.deepEqual(mode, { mode: "static", status: "ok" });
		const out = await render(loc, mode, { caching_enabled: true });
		assert.match(out.slice(0, out.indexOf("location ~*")), /proxy_pass\s+http:\/\/app:8080\/v1\/\$target;/);
		const nested = out.slice(out.indexOf("location ~*"));
		assert.match(nested, /proxy_cache public-cache;/);
		assert.match(nested, /set \$target t;[\s\S]*proxy_pass http:\/\/app:8080\/v1\/\$target;/);
		assert.doesNotMatch(out, /^\s*rewrite /m);
	});

	it("passes a variable forward path to the nested asset location as it is", async () => {
		for (const forward_path of ["/api/$arg_id", "/api/$" + "{arg_id}/x", "$request_uri"]) {
			const out = await render({ ...base, path: "/a/", forward_path }, { mode: "static" }, { caching_enabled: true });
			const nested = out.slice(out.indexOf("location ~*"));
			assert.notEqual(out.indexOf("location ~*"), -1, forward_path);
			const uri = forward_path.startsWith("/") ? forward_path : `/${forward_path}`;
			assert.ok(nested.includes(`proxy_pass http://app:8080${uri};`), forward_path);
			// "proxy_redirect default" doesn't apply to a proxy_pass with variables, the parent has none either
			assert.match(nested, /proxy_redirect off;/);
			assert.doesNotMatch(out, /^\s*rewrite /m);
		}
	});

	it("keeps the parent's captures in the nested asset location (its regex has no capture group)", async () => {
		for (const forward_path of ["/v/$1", "/v/$" + "{2}"]) {
			const out = await render({ ...base, path: "/a/", forward_path }, { mode: "static" }, { caching_enabled: true });
			const nested = out.slice(out.indexOf("location ~*"));
			const regex = nested.slice(0, nested.indexOf("\n"));
			assert.match(regex, /^location ~\* \^\.\*\\\.\(\?:css\|js\|/);
			assert.doesNotMatch(regex, /\((?!\?:)/);
			assert.ok(nested.includes(`proxy_pass http://app:8080${forward_path};`), forward_path);
		}
	});

	it("repeats the whole advanced config in the nested asset location, at the same place", async () => {
		// a nested location runs none of the parent's set / if / return / rewrite lines: guards would be skipped
		const advanced_config = [
			"set $backend app;",
			"if ($http_x_token != secret) { return 403; }",
			"if ($arg_v) { set $b two; }",
			"rewrite ^/private/old/(.*)$ /private/new/$1 break;",
			"proxy_set_header X-A $b;",
			"add_header X-B b;",
			"auth_request /auth;",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: nginx ${var} syntax, not a JS template
			'set $c "a \\"q\\" ${b}x";',
		].join("\n");
		for (const [forward_host, mode] of [
			["$backend", "static"],
			["app", "static"],
			["app", "dynamic"],
		]) {
			const out = await render(
				{ ...base, path: "^~ /private/", forward_host, forward_path: "/fp/", advanced_config },
				{ mode },
				{ caching_enabled: true, allow_websocket_upgrade: true },
			);
			const at = out.indexOf("location ~*");
			const parent = out.slice(0, at);
			const nested = out.slice(at);
			assert.ok(parent.includes(advanced_config), forward_host);
			assert.ok(nested.includes(advanced_config), forward_host);
			// before our rewrite / proxy_pass, after the host variable, as in the parent
			const copy = nested.indexOf(advanced_config);
			assert.ok(copy < nested.indexOf("proxy_pass "), forward_host);
			assert.ok(copy < nested.indexOf("proxy_set_header Host"), forward_host);
			if (mode === "dynamic") {
				assert.ok(nested.indexOf('set $npm_loc_0_host "app";') < copy);
				assert.ok(copy < nested.indexOf("rewrite "));
			}
			// the rest of the body is repeated too, so the nested location's own lists match the parent's
			assert.match(nested, /proxy_set_header Upgrade \$http_upgrade;/);
			// the copy has its own markers, so an nginx error in it maps to the same advanced config line
			assert.equal(nested.match(/# npm-location-advanced-begin 0/g).length, 1);
		}
	});

	it("leaves a nested location out of the repeated advanced config, keeping its lines", async () => {
		const advanced_config = "set $a 1;\nlocation /a/in/ {\n  return 200 in;\n}\nlocation ~ \\.x$ { return 204; } set $b 2;";
		const out = await render({ ...base, path: "/a/", advanced_config }, { mode: "dynamic" }, { caching_enabled: true });
		const nested = out.slice(out.indexOf("location ~*"));
		assert.ok(out.slice(0, out.indexOf("location ~*")).includes(advanced_config));
		assert.ok(nested.includes("set $a 1;\n\n\n\n  set $b 2;"));
		assert.doesNotMatch(nested, /location \/a\/in\/|return 20[04]/);
		assert.equal(nested.match(/location /g).length, 1);
	});

	it("repeats a Lua guard in the nested asset location as it is", async () => {
		const guard = 'access_by_lua_block {\n  -- deny unless header }\n  if ngx.var.http_x_token ~= "secret" then return ngx.exit(403) end\n}';
		const setGuard = 'set_by_lua_block $bad { if ngx.var.http_x_token ~= "}" then return "1" end return "" -- {\n}';
		for (const advanced_config of [
			`${guard}\nset_by_lua_block $bad { return "{" }\nif ($bad) { return 403; }`,
			`include /snippets/hdr.conf;\n${guard}\nif ($bad) { return 403; }`,
		]) {
			const loc = { ...base, path: "/a/", advanced_config };
			assert.equal(preflightLocation(Object.assign({}, hostDefaults, prepareLocation(loc))), null);
			const out = await render(loc, { mode: "dynamic" }, { caching_enabled: true });
			const nested = out.slice(out.indexOf("location ~*"));
			assert.ok(nested.includes(guard), advanced_config);
			assert.match(nested, /if \(\$bad\) \{ return 403; \}/);
		}
		// a `}` in the Lua code is no block end: the statement after the block is repeated too, a location after it
		// is left out
		const copy = assetAdvancedConfig(`${setGuard} if ($bad) { return 403; } location /x/ { return 200; }`);
		assert.equal(copy.text, `${setGuard} if ($bad) { return 403; }  `);
	});

	it("leaves out the cache directives the advanced config sets itself", async () => {
		const out = await render(
			{ ...base, path: "/a/", advanced_config: "expires 1h;\nproxy_read_timeout 300s;\nif ($x) { proxy_cache off; }" },
			{ mode: "dynamic" },
			{ caching_enabled: true },
		);
		const nested = out.slice(out.indexOf("location ~*"));
		// nginx rejects a second expires / proxy_read_timeout ("is duplicate"), the location's value applies
		assert.equal(nested.match(/^\s*expires /gm).length, 1);
		assert.match(nested, /expires 1h;/);
		assert.equal(nested.match(/^\s*proxy_read_timeout /gm).length, 1);
		// only the top level counts, an if block has its own settings
		assert.match(nested, /proxy_cache public-cache;/);
		assert.match(nested, /proxy_connect_timeout 5s;/);
	});

	it("prepares the advanced config for the nested asset location", () => {
		assert.deepEqual(assetAdvancedConfig(""), { text: "", own: {}, inherit: false });
		assert.deepEqual(assetAdvancedConfig(null), { text: "", own: {}, inherit: false });
		assert.deepEqual(assetAdvancedConfig("set $x 1; location /a { x; }location /b{}"), {
			text: "set $x 1;   ",
			own: {},
			inherit: false,
		});
		assert.deepEqual(assetAdvancedConfig("# location /c { }\n'location' /d { if ($a) { return 1; } }\nexpires 1h;"), {
			text: "# location /c { }\n \nexpires 1h;",
			own: { expires: true },
			inherit: false,
		});
		assert.deepEqual(assetAdvancedConfig("access_log off; proxy_cache_key $a; location /e { expires 1h; }").own, {
			access_log: true,
			proxy_cache_key: true,
		});
		// an include only inside a block doesn't count, that block's context is the same in the copy
		assert.equal(assetAdvancedConfig("if ($a) { include x.conf; }").inherit, false);
		assert.equal(assetAdvancedConfig("# include x.conf;").inherit, false);
	});

	it("repeats an advanced config with an include without the includes and list settings, those are inherited", () => {
		const text = [
			"include /snippets/proxy.conf;",
			"set $a 1; proxy_read_timeout 90s;",
			"if ($http_x_token != secret) {",
			"  return 403;",
			"}",
			"location /in/ { return 200; }",
			"limit_except GET { deny all; }",
			"rewrite ^/a/(.*)$ /b/$1 break; add_header X-A a;",
			"proxy_set_header X-B b; proxy_hide_header X-Powered-By; more_set_headers 'X-M: 1';",
			"allow 10.0.0.0/8; deny all; satisfy any; auth_basic x; auth_request /auth; error_page 401 = @x;",
			"return 418",
		].join("\n");
		const copy = assetAdvancedConfig(text);
		assert.equal(copy.inherit, true);
		assert.deepEqual(copy.own, { proxy_read_timeout: true });
		assert.equal(
			copy.text,
			// a statement on one line becomes a space, so its neighbours stay apart
			[
				" ",
				"set $a 1; proxy_read_timeout 90s;",
				"if ($http_x_token != secret) {",
				"  return 403;",
				"}",
				" ",
				"limit_except GET { deny all; }",
				"rewrite ^/a/(.*)$ /b/$1 break;  ",
				"  proxy_hide_header X-Powered-By;  ",
				"    satisfy any; auth_basic x; auth_request /auth;  ",
				"return 418",
			].join("\n"),
		);
		// the same line numbers as the advanced config
		assert.equal(copy.text.split("\n").length, text.split("\n").length);
	});

	it("leaves out valid_referers and the other inherited lists with an include, the included entries apply too", () => {
		// a valid_referers of its own would replace the included one (and its none / server_names flags)
		const lists = [
			"valid_referers *.example.com;",
			"mirror /mirror;",
			"error_log /data/logs/x.log;",
			"index index.html;",
			"ssi_types text/x;",
			"addition_types text/x;",
			"charset_types text/x;",
		];
		const text = ["include /snippets/ref.conf;", ...lists, "if ($invalid_referer) { return 403; }"].join("\n");
		const copy = assetAdvancedConfig(text);
		assert.equal(copy.text, [" ", ...lists.map(() => " "), "if ($invalid_referer) { return 403; }"].join("\n"));
		// without an include they are repeated
		assert.equal(assetAdvancedConfig(lists.join("\n")).text, lists.join("\n"));
	});

	it("sets no proxy_redirect of its own in the nested asset location with an include, it inherits the location's", async () => {
		// Authelia's proxy.conf has "proxy_redirect http:// $scheme://;", an own rule of the nested location would
		// replace it for the assets
		for (const [forward_host, forward_path, mode, parentRule] of [
			["app", "/x", "static", null],
			["app", "/x", "dynamic", /proxy_redirect\s+http:\/\/app:8080\/x \/a\/;/],
			["app", "", "dynamic", /proxy_redirect\s+http:\/\/app:8080\/ \/;/],
			["$backend", "/x", "static", null],
			["app", "/api/$arg_id", "static", null],
		]) {
			const out = await render(
				{ ...base, path: "/a/", forward_host, forward_path, advanced_config: "include /snippets/proxy.conf;" },
				{ mode },
				{ caching_enabled: true },
			);
			const at = out.indexOf("location ~*");
			const end = out.indexOf("\n    }\n", at);
			assert.notEqual(at, -1);
			const nested = out.slice(at, end);
			const parent = out.slice(0, at) + out.slice(end);
			assert.doesNotMatch(nested, /proxy_redirect/, `${forward_host} ${forward_path} ${mode}`);
			if (parentRule) {
				assert.match(parent, parentRule);
			} else {
				assert.doesNotMatch(parent, /proxy_redirect/, `${forward_host} ${forward_path} ${mode}`);
			}
		}
	});

	it("repeats every rewrite-phase statement of an advanced config with an include, of any module", () => {
		// nginx runs none of them from the parent in a nested location: a guard reading their variable would let
		// assets through (set_by_lua_block, set-misc, form-input, encrypted-session, array-var)
		const guards = [
			'set_by_lua_block $bad { if ngx.var.http_x_token ~= "secret" then return "1" end return "" }',
			"set_by_lua $bad2 'return ngx.var.http_x_token';",
			"set_by_lua_file $bad3 /data/lua/check.lua;",
			"set_if_empty $tok $http_x_token;",
			"set_unescape_uri $u $arg_u;",
			"set_md5 $m $http_x_token;",
			"set_form_input $f;",
			"set_decrypt_session $s $cookie_s;",
			"array_split , $arg_l to=$list;",
			"rewrite_by_lua_block { ngx.var.x = 1 }",
			"access_by_lua_block { return ngx.exit(403) }",
			"if ($bad) { return 403; }",
			"rewrite_log on;",
			"uninitialized_variable_warn off;",
			"break;",
		];
		const text = ["include /snippets/hdr.conf;", ...guards].join("\n");
		const copy = assetAdvancedConfig(text);
		assert.equal(copy.inherit, true);
		assert.equal(copy.text, [" ", ...guards].join("\n"));
	});

	it("leaves out proxy_cache of the asset block when the advanced config sets proxy_store", () => {
		// nginx -t: "proxy_store" directive is incompatible with "proxy_cache"
		for (const prefix of ["", "include /snippets/x.conf;\n"]) {
			assert.deepEqual(assetAdvancedConfig(`${prefix}proxy_store on;`).own, { proxy_cache: true });
			assert.deepEqual(assetAdvancedConfig(`${prefix}proxy_store /data/store$uri;`).own, { proxy_cache: true });
			assert.deepEqual(assetAdvancedConfig(`${prefix}proxy_store off;`).own, {});
			assert.deepEqual(assetAdvancedConfig(`${prefix}if ($x) { proxy_store on; }`).own, {});
		}
	});

	it("keeps the location's proxy_store for its cached assets", async () => {
		for (const prefix of ["", "include /snippets/x.conf;\n"]) {
			const advanced_config = `${prefix}proxy_store /data/store$uri;`;
			const out = await render({ ...base, path: "/a/", advanced_config }, { mode: "dynamic" }, { caching_enabled: true });
			const nested = out.slice(out.indexOf("location ~*"));
			assert.match(nested, /proxy_store \/data\/store\$uri;/, prefix);
			assert.doesNotMatch(nested, /proxy_cache public-cache;/, prefix);
			assert.match(nested, /expires @30m;/, prefix);
		}
		const out = await render(
			{ ...base, path: "/a/", advanced_config: "proxy_store off;" },
			{ mode: "dynamic" },
			{ caching_enabled: true },
		);
		assert.match(out.slice(out.indexOf("location ~*")), /proxy_cache public-cache;/);
	});

	it("does not repeat an included file in the nested asset location, it inherits the location's settings", async () => {
		// Authelia's snippets: proxy.conf sets proxy_read_timeout / proxy_connect_timeout / proxy_set_header,
		// authrequest.conf auth_request and proxy_set_header; a second copy would be rejected ("is duplicate"),
		// an included `location` too ("is outside location")
		const advanced_config = [
			"include /snippets/proxy.conf;",
			"include /snippets/authelia-authrequest.conf;",
			"set $backend app;",
			"if ($http_x_token != secret) { return 403; }",
			"proxy_set_header X-A a;",
		].join("\n");
		for (const [forward_host, mode] of [
			["$backend", "static"],
			["app", "static"],
			["app", "dynamic"],
		]) {
			const out = await render(
				{ ...base, path: "^~ /private/", forward_host, forward_path: "/fp/", advanced_config },
				{ mode },
				{
					caching_enabled: true,
					allow_websocket_upgrade: true,
					access_list_id: 4,
					access_list: { items: [{ username: "a" }], clients: [], pass_auth: false, satisfy_any: false },
					certificate_id: 1,
					certificate: { id: 1 },
					ssl_forced: true,
					hsts_enabled: true,
					block_exploits: true,
				},
			);
			const at = out.indexOf("location ~*");
			const end = out.indexOf("\n    }\n", at);
			const nested = out.slice(at, end);
			const parent = out.slice(0, at) + out.slice(end);
			assert.ok(parent.includes(advanced_config), forward_host);
			assert.match(parent, /proxy_set_header Upgrade/);
			assert.match(parent, /add_header Strict-Transport-Security/);
			assert.doesNotMatch(nested, /include \/snippets/, forward_host);
			// the rewrite statements are repeated, guards apply to assets
			assert.match(nested, /\n\s*set \$backend app;\nif \(\$http_x_token != secret\) \{ return 403; \}\n/, forward_host);
			// no list of its own: proxy_set_header / add_header / auth_basic / allow / websocket lines are inherited
			assert.doesNotMatch(nested, /proxy_set_header|add_header|auth_basic|satisfy|proxy_http_version/, forward_host);
			// rewrite-phase includes of NPM itself are repeated, they are known
			assert.match(nested, /include conf\.d\/include\/block-exploits\.conf;/);
			assert.match(nested, /include conf\.d\/include\/force-ssl\.conf;/);
			// the cache settings of the asset block are its own, the included file's don't reach the nested location
			assert.match(nested, /expires @30m;/);
			assert.match(nested, /proxy_read_timeout 45s;/);
			assert.match(nested, /proxy_pass /);
		}
	});

	it("keeps the rendering of a literal forward path", async () => {
		const out = await render({ ...base, path: "/a", forward_path: "/x" }, { mode: "dynamic" }, { caching_enabled: true });
		const nested = out.slice(out.indexOf("location ~*"));
		assert.match(nested, /proxy_pass http:\/\/\$npm_loc_0_host:8080;/);
		assert.match(nested, /proxy_redirect http:\/\/app:8080\/x \/a;/);
	});

	it("renders a regex location with captures in the forward path literally, in either mode", async () => {
		const loc = { ...base, path: "~ ^/api/(.*)$", forward_path: "/v1/$1" };
		const mode = chooseLocationMode(prepareLocation(loc), { mode: "dynamic", status: "ok" });
		assert.deepEqual(mode, { mode: "static", status: "ok" });
		const out = await render(loc, mode, { caching_enabled: true });
		assert.match(out, /location ~ \^\/api\/\(\.\*\)\$ \{/);
		assert.match(out, /proxy_pass\s+http:\/\/app:8080\/v1\/\$1;/);
		// no rewrite or set (they would not change $1, but are not needed)
		assert.doesNotMatch(out, /^\s*rewrite |npm_loc_0_host/m);
		// the nested asset location keeps $1 (its regex has no capture group)
		const nested = out.slice(out.indexOf("location ~*"));
		assert.match(nested, /proxy_pass http:\/\/app:8080\/v1\/\$1;/);
	});

	it("renders a named location with a variable forward path literally", async () => {
		const loc = { ...base, path: "@fb", forward_path: "/p$request_uri" };
		const out = await render(loc, chooseLocationMode(prepareLocation(loc), { mode: "dynamic", status: "ok" }));
		assert.match(out, /location @fb \{/);
		assert.match(out, /proxy_pass\s+http:\/\/app:8080\/p\$request_uri;/);
		assert.doesNotMatch(out, /rewrite|npm_loc_0_host/);
	});

	it("does not nest the asset cache in exact or named locations", async () => {
		const out = await render({ ...base, path: "= /a" }, { mode: "dynamic" }, { caching_enabled: true });
		assert.doesNotMatch(out, /location ~\*/);
	});

	it("renders access lists", async () => {
		const out = await render(
			{ ...base, path: "/a" },
			{ mode: "dynamic" },
			{
				access_list_id: 4,
				access_list: {
					id: 4,
					items: [{ username: "u" }],
					clients: [{ directive: "allow", address: "10.0.0.0/8" }],
					pass_auth: false,
					satisfy_any: false,
				},
			},
		);
		assert.match(out, /auth_basic_user_file\s+\/data\/access\/4;/);
		assert.match(out, /allow 10\.0\.0\.0\/8;/);
		assert.match(out, /deny all;/);
	});
});

describe("describeConfigLine", () => {
	const config = [
		"server {", // 1
		"  # npm-advanced-config-begin", // 2
		"  add_header X 1;", // 3
		"  bogus;", // 4
		"  # npm-advanced-config-end", // 5
		"  # npm-location-begin 0", // 6
		"  location /a {", // 7
		"    # npm-location-advanced-begin 0", // 8
		"    foo;", // 9
		"    # npm-location-advanced-end 0", // 10
		"    proxy_pass http://x:1;", // 11
		"  }", // 12
		"  # npm-location-end 0", // 13
		"  # npm-location-begin 1", // 14
		"  location /b { }", // 15
		"  # npm-location-end 1", // 16
		"}", // 17
	].join("\n");

	it("maps host advanced config lines", () => {
		assert.deepEqual(describeConfigLine(config, 4), { location_index: null, area: "host_advanced", relative_line: 2 });
	});

	it("maps location lines", () => {
		assert.equal(describeConfigLine(config, 11).location_index, 0);
		assert.equal(describeConfigLine(config, 11).area, "location");
		assert.equal(describeConfigLine(config, 15).location_index, 1);
		assert.equal(describeConfigLine(config, 13).location_index, 0);
	});

	it("maps location advanced config lines", () => {
		assert.deepEqual(describeConfigLine(config, 9), { location_index: 0, area: "location_advanced", relative_line: 1 });
	});

	it("returns nothing outside of markers", () => {
		assert.deepEqual(describeConfigLine(config, 17), { location_index: null, area: null, relative_line: null });
		assert.deepEqual(describeConfigLine(config, 1), { location_index: null, area: null, relative_line: null });
		assert.equal(describeConfigLine("", 3).location_index, null);
	});
});

describe("publicLocationState", () => {
	it("keeps the contract shape", () => {
		assert.deepEqual(publicLocationState({ index: 1, path: "/a", status: "quarantined", mode: "dynamic", stub: true }), {
			index: 1,
			path: "/a",
			status: "quarantined",
			mode: null,
			code: null,
			params: null,
			message: null,
		});
		assert.equal(publicLocationState({ index: 0, path: "/", status: "unresolved", mode: "dynamic" }).mode, "dynamic");
	});

	it("sends a code and params with the English message", () => {
		const state = { index: 0, path: "/a", status: "unresolved", mode: "dynamic", stub: true };
		Object.assign(state, locationMessage("unresolved", { host: "app" }));
		assert.deepEqual(publicLocationState(state), {
			index: 0,
			path: "/a",
			status: "unresolved",
			mode: "dynamic",
			code: "unresolved",
			params: { host: "app" },
			message: MESSAGES.unresolved("app"),
		});
		assert.deepEqual(locationMessage("rejected", { detail: "Unknown directive." }), {
			code: "rejected",
			params: { detail: "Unknown directive." },
			message: "Disabled because nginx rejected it: Unknown directive.",
		});
		assert.equal(
			locationMessage("omitted", { detail: "X." }).message,
			"Removed because nginx rejected it, even as a placeholder: X.",
		);
		// the English message can say the detail differently, eg. not capitalised
		assert.equal(
			locationMessage("rejected", { detail: "Unknown directive." }, "unknown directive.").message,
			"Disabled because nginx rejected it: unknown directive.",
		);
		// every message has a code
		assert.deepEqual(Object.keys(MESSAGE_CODES).sort(), Object.keys(MESSAGES).sort());
	});
});

describe("chooseLocationMode", () => {
	const loc = (extra) => prepareLocation({ ...base, path: "/u/", forward_path: "/x/", ...extra });
	const dynamicOk = { mode: "dynamic", status: "ok" };

	it("keeps the resolver's decision normally", () => {
		assert.deepEqual(chooseLocationMode(loc({}), dynamicOk), dynamicOk);
		assert.deepEqual(chooseLocationMode(loc({}), { mode: "static", status: "ok" }), { mode: "static", status: "ok" });
	});

	it("stays static when the advanced config reads $uri, which the dynamic rewrite changes", () => {
		for (const adv of ["proxy_set_header X-Seen-Uri $uri;", "add_header X $document_uri;", "try_files $" + "{uri} =404;"]) {
			assert.deepEqual(chooseLocationMode(loc({ advanced_config: adv }), dynamicOk), { mode: "static", status: "ok" }, adv);
		}
		// $uri_x is another variable, no forward path means no rewrite
		assert.deepEqual(chooseLocationMode(loc({ advanced_config: "add_header X $uri_x;" }), dynamicOk), dynamicOk);
		assert.deepEqual(
			chooseLocationMode(loc({ forward_path: "", advanced_config: "add_header X $uri;" }), dynamicOk),
			dynamicOk,
		);
	});

	it("stays dynamic when the host does not resolve, a literal unknown host fails nginx -t", () => {
		const unresolved = { mode: "dynamic", status: "unresolved" };
		assert.deepEqual(chooseLocationMode(loc({ advanced_config: "add_header X $uri;" }), unresolved), unresolved);
	});

	it("renders a forward path with an nginx variable literally, nginx sends that URI as it is", () => {
		for (const forward_path of ["/api/$arg_id", "/api/$" + "{arg_id}/x", "$request_uri", "/v/$1"]) {
			const l = loc({ forward_path });
			assert.equal(hasVariablePath(l), true, forward_path);
			assert.deepEqual(chooseLocationMode(l, dynamicOk), { mode: "static", status: "ok" }, forward_path);
			// nginx resolves a proxy_pass with variables per request, the warning stays
			assert.deepEqual(chooseLocationMode(l, { mode: "dynamic", status: "unresolved" }), {
				mode: "static",
				status: "unresolved",
			});
			assert.deepEqual(chooseLocationMode(l, { mode: "static", status: "ok" }), { mode: "static", status: "ok" });
		}
		assert.equal(hasVariablePath(loc({ forward_path: "/x/" })), false);
		assert.equal(hasVariablePath(loc({ forward_path: "" })), false);
	});
});
