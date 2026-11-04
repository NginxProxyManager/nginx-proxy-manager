import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	bracesBalanced,
	chooseLocationMode,
	describeConfigLine,
	escapeRegex,
	findDuplicatePath,
	isVariableHost,
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
		assert.equal(preflightLocation(prepareLocation({ ...base, path: "/a", enabled: false })).status, "disabled");
	});

	it("quarantines regex locations with a forward path", () => {
		const res = preflightLocation(prepareLocation({ ...base, path: "~ ^/x", forward_path: "/y" }));
		assert.deepEqual(res, { status: "quarantined", message: MESSAGES.regexWithForwardPath });
	});

	it("quarantines invalid host names", () => {
		for (const host of ["a b", "a;b", 'a"b', "a{", "$x y", "a$x", "$x;", "$" + "{x}", "#x"]) {
			assert.equal(preflightLocation(prepareLocation({ ...base, path: "/a", forward_host: host })).status, "quarantined");
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
			assert.deepEqual(res, { status: "quarantined", message: MESSAGES.invalidPath }, JSON.stringify(loc));
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
			// the nested location sets no headers of its own, so it inherits the parent's Host $forward_host
			assert.match(out.slice(0, out.indexOf("location ~*")), /proxy_set_header Host \$forward_host;/);
			assert.doesNotMatch(nested, /proxy_set_header/);
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
		assert.match(out, /proxy_pass\s+http:\/\/\$backend:8080\/fp;/);
		assert.doesNotMatch(out, /rewrite|npm_loc_0_host|proxy_redirect/);
		// a nested location would not run the parent's `set $backend`
		assert.doesNotMatch(out, /location ~\*/);
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
			message: null,
		});
		assert.equal(publicLocationState({ index: 0, path: "/", status: "unresolved", mode: "dynamic" }).mode, "dynamic");
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
});
