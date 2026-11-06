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
		"access_log $logpath;",
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
		"include /data/nginx/custom/*.conf;",
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
