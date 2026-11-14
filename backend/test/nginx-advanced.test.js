import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findForbiddenFileDirective, tokenize } from "../lib/nginx-advanced.js";

describe("tokenize", () => {
	it("reads quotes, comments and braces like nginx", () => {
		assert.deepEqual(tokenize('add_header X a"b; return 301 /#/x; return 200 x}; set $a $' + '{h}y; a \\"b c;'), [
			["add_header", "X", 'a"b'],
			["return", "301", "/#/x"],
			["return", "200", "x}"],
			["set", "$a", "$" + "{h}y"],
			["a", '"b', "c"],
		]);
		assert.deepEqual(tokenize("a 'x\\'y' \"q\\\\\" \\d;"), [["a", "x'y", "q\\", "\\d"]]);
	});

	it("splits statements, handles quotes and comments", () => {
		assert.deepEqual(tokenize('access_log "/a b" main; # error_log /x;\nlocation /p { include x; }'), [
			["access_log", "/a b", "main"],
			["location", "/p"],
			["include", "x"],
		]);
	});
});

describe("findForbiddenFileDirective", () => {
	const rejected = [
		"access_log /data/nginx/proxy_host/5.conf;",
		"access_log /data/nginx/custom/http.conf combined;",
		'error_log "/etc/nginx/conf.d/x.conf" warn;',
		"access_log /data/logs/../nginx/proxy_host/2.conf;",
		// nginx reads a quote only at the start of a token: here a"b and c"d are plain words
		'add_header X-A a"b; access_log /data/nginx/proxy_host/1.conf; add_header X-B c"d;',
		"return 301 /#/x; access_log /data/nginx/stream/1.conf;",
		"add_header X-A don't; include /data/nginx/proxy_host/1.conf;",
		// glob(3) patterns that match generated configs
		"include /data/nginx/proxy_hos[t]/1.conf;",
		"include /data/nginx/*/1.conf;",
		"include /data/nginx/[a-z]*_host/*.conf;",
		"include /data/nginx/?roxy_host/1.conf;",
		"include /data/nginx/**********t/*.conf;",
		"include /data/nginx/*?*?*?*?_host/*.conf;",
		"include /data/nginx/[!a]roxy_host/*.conf;",
		"include /data/nginx/pro\\xy_host/*.conf;",
		// an invalid range: assumed to match anything
		"include /data/nginx/[z-a]*/*.conf;",
		// nginx turns \\ into \, glob(3) reads \t as t
		"include /data/nginx/proxy_hos\\\\t/*.conf;",
		"include ../../data/nginx/proxy_host/1.conf;",
		// paths through /proc or /dev/fd lead anywhere
		"access_log /proc/self/root/data/nginx/custom/http.conf;",
		"include /proc/self/root/data/nginx/proxy_host/1.conf;",
		"access_log /proc/1/cwd/x.log;",
		"error_log /dev/fd/5/x;",
		// config files nginx reads
		"access_log /data/nginx/custom/http.conf;",
		"access_log /data/nginx/temp/x.log;",
		"access_log /data/nginx/proxy_host/5.log;",
		"access_log /etc/nginx/mime.types;",
		"access_log /etc/nginx/conf.d/include/x.log;",
		"access_log ../conf.d/x.log;",
		"access_log ../nginx.conf;",
		// the fixed part before a variable can still reach them
		"access_log /data/nginx/$x;",
		"access_log /data/nginx/proxy_$x.log;",
		"access_log /data/nginx/custom/$host.conf;",
		"access_log ../conf.d/$host.log;",
		"access_log /data/nginx/custom/$http_x;",
		"access_log /data/nginx/custom$http_x;",
		"access_log /data/nginx/custom/x_$" + "{http_x};",
		"access_log logs/$http_x;",
		"access_log /data/logs/$http_x;",
		"access_log /data/$http_x;",
		"access_log /data/nginx/custom/$http_x.co$http_y;",
		// a variable from the request can hold `/..` and leave any fixed part that completes to a directory
		"access_log /data/logs$http_x;",
		"access_log /data/log$http_x;",
		"access_log /data/logs/x$http_x;",
		"access_log /data/logs/$http_x.conf;",
		"access_log /data/logs$arg_a.conf;",
		"access_log logs$http_x;",
		"access_log /data/logs/x_$" + "{cookie_c};",
		// a request variable first picks the whole path (relative ones resolve below /etc/nginx/nginx/)
		"access_log $http_x;",
		"access_log $" + "{http_x};",
		"access_log $arg_f;",
		"access_log $cookie_c combined;",
		'access_log "$http_x";',
		"access_log '$http_x' combined;",
		"access_log $host$http_x;",
		"access_log $" + "{host}$http_x;",
		"access_log $http_x.log;",
		"access_log $cookie_c.log;",
		"access_log $request_uri;",
		"access_log $uri;",
		"access_log $args;",
		"access_log $query_string;",
		"access_log $request_body;",
		"access_log $sent_http_location;",
		"access_log $upstream_http_x;",
		"access_log $1;",
		"access_log $remote_user;",
		// a variable not set in the same text: can't be known
		"access_log $logpath;",
		// set from the request
		"set $p $http_x; access_log $p;",
		"set $p /data/logs$http_x; access_log $p;",
		"set $p /data/logs/a.log; if ($arg_x) { set $p $arg_x; } access_log $p;",
		"set $a $b; set $b $http_x; access_log $a;",
		"set $p $p; access_log $p.log;",
		"set $p /data/nginx/proxy_host/2.conf; access_log $p;",
		"set $d /data/nginx/proxy_host; access_log $d/$host;",
		// becomes <id>.conf at startup when that is missing
		"access_log /data/logs$http_x.npm-aside;",
		// the client picks the directory of a file without an extension
		"access_log /data/logs$http_x/a.b/c;",
		"access_log /data/logs/$http_x.d/foo;",
		// `..` after a variable leaves its directory
		"access_log /data/$host/../nginx/proxy_host/2.conf;",
		"access_log $host/../../../data/nginx/proxy_host/2.conf;",
		"access_log /data/logs/$status/../../nginx/custom/http.conf;",
		"location /x {\n  error_log /etc/nginx/nginx.conf;\n}",
		"include /data/nginx/proxy_host/2.conf;",
		"include /data/nginx/stream/*.conf;",
		"include /data/nginx/default_host/site.conf;",
		"include /data//nginx/redirection_host/1.conf;",
		"include '/data/nginx/dead_host/3.conf';",
	];
	for (const text of rejected) {
		it(`rejects ${text}`, () => {
			const out = findForbiddenFileDirective(text);
			assert.ok(out, text);
			assert.match(out.reason, /not allowed|must not/);
		});
	}

	const allowed = [
		"",
		"access_log off;",
		"access_log /data/logs/custom_access.log proxy;",
		"error_log /data/logs/custom_error.log warn;",
		"access_log syslog:server=10.0.0.1 combined;",
		"error_log stderr;",
		"access_log /dev/stdout;",
		// set in the same text from literals and variables that can't hold `/` or `..`
		"set $logpath /data/logs/custom.log; access_log $logpath;",
		"set $logpath /data/logs/$host; access_log $logpath.log;",
		"set $p /data/logs/a.log; if ($host = x) { set $p /data/logs/b.log; } access_log $p;",
		"access_log $host.log;",
		"access_log $" + "{host}_access.log;",
		// error_log has no variables: a file literally named "$http_x" below /etc/nginx/nginx/
		"error_log $http_x;",
		"include /data/nginx/custom/snippet.conf;",
		"include /snippets/auth.conf;",
		"include conf.d/include/ssl-ciphers.conf;",
		"root /data/nginx/proxy_host;",
		"alias /data/nginx/;",
		"# access_log /data/nginx/proxy_host/5.conf;",
		'add_header X-Path "access_log /data/nginx/proxy_host/5.conf";',
		"proxy_pass http://backend;",
		// relative log paths resolve below the nginx prefix /etc/nginx/nginx/
		"access_log logs/custom.log;",
		"error_log logs/err.log;",
		"access_log logs/$host.log;",
		// logs next to the user's own snippets
		"access_log /data/nginx/custom/custom_access.log;",
		"access_log /data/nginx/custom/$host.log;",
		"access_log /data/logs/$host.log;",
		"access_log /data/logs/$" + "{host}_access.log;",
		"access_log /data/logs/proxy_$host;",
		"access_log /data/logs/$http_x.log;",
		"access_log /data/logs/access_$remote_addr-$status;",
		"include /data/nginx/custom/*.conf;",
		"include /data/nginx/****z/*.conf;",
		"include /data/nginx/[^p]roxy_host/*.conf;",
		"include /data/nginx/?????????????????????????/*.conf;",
		"include /snippets/*.conf;",
		"include conf.d/include/*.conf;",
		"include conf.d/include/assets.conf;",
		"error_log /dev/stderr;",
		'add_header X-A a"b; access_log /data/logs/x.log;',
	];
	for (const text of allowed) {
		it(`allows ${text || "(empty)"}`, () => {
			assert.equal(findForbiddenFileDirective(text), null);
		});
	}
});

describe("findForbiddenFileDirective with long include patterns", () => {
	// The glob match ran as a RegExp, which backtracked exponentially on runs of `*` (2.4 s at 16 stars)
	const patterns = [
		"*".repeat(1000),
		`${"*".repeat(1000)}z`,
		`${"*?".repeat(500)}z`,
		`${"?*".repeat(500)}!`,
		`${"[a-z]*".repeat(500)}!`,
		`${"*".repeat(5000)}_hos`,
	];
	for (const pattern of patterns) {
		it(`checks ${pattern.slice(0, 12)}... (${pattern.length} characters) in linear time`, () => {
			for (const text of [`include /data/nginx/${pattern}/*.conf;`, `include /${pattern}/${pattern}/${pattern}/x;`]) {
				const start = performance.now();
				findForbiddenFileDirective(text);
				assert.ok(performance.now() - start < 50, text.slice(0, 40));
			}
		});
	}

	it("still matches generated config dirs with many stars", () => {
		assert.ok(findForbiddenFileDirective(`include /data/nginx/${"*".repeat(1000)}/*.conf;`));
		assert.ok(findForbiddenFileDirective(`include /data/nginx/${"*?".repeat(4)}${"*".repeat(1000)}host/*.conf;`));
		assert.equal(findForbiddenFileDirective(`include /data/nginx/${"*?".repeat(17)}/*.conf;`), null);
	});
});

describe("findForbiddenFileDirective with many expanded access_log paths", () => {
	// Each access_log expanded to up to 64 paths of the set values' length, so repeating it cost
	// (statements x 64 x value length): 99 KB took 45 s
	const timed = (text) => {
		const start = performance.now();
		const result = findForbiddenFileDirective(text);
		return { result, ms: performance.now() - start };
	};

	it("stays fast with long set values and many access_log statements", () => {
		for (const vlen of [20000, 2000, 200]) {
			const value = `/data/logs/${"a".repeat(vlen)}`;
			const head = `set $a ${value}; set $a ${value};`;
			const line = "access_log $a$a$a$a$a$a;";
			const text = head + line.repeat(Math.floor((99000 - head.length) / line.length));
			const { result, ms } = timed(text);
			assert.ok(ms < 200, `${vlen}: ${ms} ms`);
			assert.ok(result, "a text whose paths can't all be checked is refused");
		}
	});

	it("stays fast with many values for one variable", () => {
		const { ms } = timed("set $a /data/logs/x.log;".repeat(4000) + "access_log $a;".repeat(3000));
		assert.ok(ms < 200, `${ms} ms`);
	});

	it("still allows ordinary configs that set log paths", () => {
		const statements = "access_log $f; access_log $d/$host.log;".repeat(200);
		const text = `set $d /data/logs/app; set $f "$d/access.log";${statements}`;
		assert.equal(findForbiddenFileDirective(text), null);
	});
});
