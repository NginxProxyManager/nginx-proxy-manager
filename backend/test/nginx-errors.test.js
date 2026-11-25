import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	cleanNginxOutput,
	humaniseNginxMessage,
	mayResolveLater,
	parseManagedFile,
	parseNginxTestOutput,
	sentence,
} from "../lib/nginx-errors.js";

const DOCKERISM =
	'nginx: [alert] could not open error log file: open() "/var/log/nginx/error.log" failed (6: No such device or address)';

describe("cleanNginxOutput", () => {
	it("removes the error.log alert and the test failed line", () => {
		const out = cleanNginxOutput(
			`${DOCKERISM}\nnginx: [emerg] unknown directive "foo" in /data/nginx/proxy_host/1.conf:3\nnginx: configuration file /etc/nginx/nginx.conf test failed\n`,
		);
		assert.equal(out, 'nginx: [emerg] unknown directive "foo" in /data/nginx/proxy_host/1.conf:3');
	});

	it("keeps real errors that mention /var/log/nginx/error.log", () => {
		const emerg =
			'nginx: [emerg] open() "/var/log/nginx/error.log" failed (13: Permission denied) in /data/nginx/proxy_host/4.conf:9';
		assert.equal(cleanNginxOutput(`${DOCKERISM}\n${emerg}`), emerg);
		const parsed = parseNginxTestOutput(`${DOCKERISM}\n${emerg}`);
		assert.equal(parsed.file, "/data/nginx/proxy_host/4.conf");
		assert.equal(parsed.line, 9);
	});
});

describe("parseNginxTestOutput", () => {
	it("extracts file, line and message", () => {
		const parsed = parseNginxTestOutput(
			`${DOCKERISM}\nnginx: [emerg] host not found in upstream "foo:80" in /data/nginx/proxy_host/12.conf:57\nnginx: configuration file /etc/nginx/nginx.conf test failed`,
		);
		assert.equal(parsed.file, "/data/nginx/proxy_host/12.conf");
		assert.equal(parsed.line, 57);
		assert.equal(parsed.message, 'host not found in upstream "foo:80"');
		assert.ok(!parsed.output.includes("error.log"));
	});

	it("handles messages without a file", () => {
		const parsed = parseNginxTestOutput('nginx: [emerg] cannot load certificate "/x.pem": BIO_new_file() failed');
		assert.equal(parsed.file, null);
		assert.equal(parsed.line, null);
		assert.match(parsed.message, /^cannot load certificate/);
	});

	it("handles the pid prefix of some messages", () => {
		const parsed = parseNginxTestOutput(
			'2026/11/04 10:00:00 [emerg] 12#12: unknown directive "x" in /data/nginx/custom/http.conf:1',
		);
		assert.equal(parsed.file, "/data/nginx/custom/http.conf");
		assert.equal(parsed.message, 'unknown directive "x"');
	});

	it("survives empty output", () => {
		const parsed = parseNginxTestOutput("");
		assert.equal(parsed.file, null);
		assert.equal(parsed.message, "");
	});
});

describe("parseManagedFile", () => {
	it("recognises host config files", () => {
		assert.deepEqual(parseManagedFile("/data/nginx/proxy_host/12.conf"), { host_type: "proxy_host", host_id: 12 });
		assert.deepEqual(parseManagedFile("/data/nginx/stream/3.conf"), { host_type: "stream", host_id: 3 });
		assert.deepEqual(parseManagedFile("/data/nginx/dead_host/1.conf"), { host_type: "dead_host", host_id: 1 });
		assert.deepEqual(parseManagedFile("/data/nginx/redirection_host/9.conf"), {
			host_type: "redirection_host",
			host_id: 9,
		});
	});

	it("ignores other files", () => {
		assert.equal(parseManagedFile("/data/nginx/custom/http.conf"), null);
		assert.equal(parseManagedFile("/data/nginx/default_host/site.conf"), null);
		assert.equal(parseManagedFile("/data/nginx/proxy_host/12.conf.err"), null);
		assert.equal(parseManagedFile(null), null);
	});
});

describe("humaniseNginxMessage", () => {
	const cases = [
		['host not found in upstream "foo:8080"', 'host "foo" could not be resolved'],
		['host not found in upstream "foo"', 'host "foo" could not be resolved'],
		['invalid port in upstream "foo:99999"', 'invalid port in upstream "foo:99999"'],
		['unknown directive "proxy_passs"', 'unknown directive "proxy_passs"'],
		[
			'invalid number of arguments in "proxy_set_header" directive',
			'wrong number of arguments for "proxy_set_header"',
		],
		['"proxy_buffering" directive is duplicate', '"proxy_buffering" is set more than once'],
		['duplicate location "/api"', 'the location "/api" is defined more than once'],
		['unexpected "}"', 'unexpected "}"'],
		['unexpected end of file, expecting "}"', 'the configuration ends unexpectedly, a "}" is missing'],
		[
			'"proxy_pass" cannot have URI part in location given by regular expression, or inside named location, or inside "if" statement, or inside "limit_except" block',
			"a forward path without an nginx variable can't be used with a regular-expression or named location",
		],
		[
			'pcre2_compile() failed: missing closing parenthesis in "^/(a"',
			"invalid regular expression (missing closing parenthesis)",
		],
		[
			'cannot load certificate "/etc/letsencrypt/live/npm-1/fullchain.pem": BIO_new_file() failed (SSL: error:80000002)',
			'the certificate file "/etc/letsencrypt/live/npm-1/fullchain.pem" could not be loaded',
		],
		[
			'no "ssl_certificate" is defined for the "listen ... ssl" directive',
			"SSL is enabled but no certificate is defined",
		],
		['invalid parameter "foo"', 'invalid parameter "foo"'],
		['"location" directive is not allowed here', 'a "location" block is not allowed here'],
		[
			'location "y" cannot be inside the exact location "/x"',
			'the location "y" can\'t be placed inside the exact location "/x"',
		],
		['"proxy_pass" directive is not allowed here', 'the "proxy_pass" directive is not allowed here'],
	];

	for (const [input, expected] of cases) {
		it(`humanises: ${input.slice(0, 50)}`, () => {
			assert.equal(humaniseNginxMessage(input).text, expected);
		});
	}

	it("passes unknown messages through", () => {
		assert.deepEqual(humaniseNginxMessage("something odd"), { text: "something odd", hint: null, code: null });
	});

	it("gives a hint for unresolvable hosts", () => {
		assert.ok(humaniseNginxMessage('host not found in upstream "x"').hint);
	});
});

describe("sentence", () => {
	it("adds a full stop once", () => {
		assert.equal(sentence("abc"), "abc.");
		assert.equal(sentence("abc."), "abc.");
	});
});

describe("mayResolveLater", () => {
	it("is true for a host that is offline because an upstream did not resolve", () => {
		assert.equal(
			mayResolveLater({
				nginx_online: false,
				nginx_err: "Host not found.",
				nginx_details: {
					nginx_output: 'nginx: [emerg] host not found in upstream "app:80" in /data/nginx/stream/3.conf:13',
				},
			}),
			true,
		);
	});

	it("is false for a host that is offline for another reason", () => {
		assert.equal(
			mayResolveLater({
				nginx_online: false,
				nginx_err: "Unknown directive.",
				nginx_details: { nginx_output: 'nginx: [emerg] unknown directive "foo"' },
			}),
			false,
		);
	});

	it("is true for a proxy host with an unresolved custom location", () => {
		assert.equal(
			mayResolveLater({
				nginx_online: true,
				nginx_locations: [{ status: "ok" }, { status: "unresolved" }],
			}),
			true,
		);
	});

	it("is false for an online host without unresolved locations", () => {
		assert.equal(mayResolveLater({ nginx_online: true, nginx_locations: [{ status: "quarantined" }] }), false);
		assert.equal(mayResolveLater({ nginx_online: true }), false);
		assert.equal(mayResolveLater(null), false);
	});
});

describe("cleanNginxOutput: PUID noise", () => {
	it("drops the 'user' directive warning nginx prints when not running as root", () => {
		const out = [
			'nginx: [warn] the "user" directive makes sense only if the master process runs with super-user privileges, ignored in /etc/nginx/nginx.conf:4',
			'nginx: [emerg] invalid value "maybe" in /data/nginx/proxy_host/2.conf:39',
			"nginx: configuration file /etc/nginx/nginx.conf test failed",
		].join("\n");
		assert.equal(cleanNginxOutput(out), 'nginx: [emerg] invalid value "maybe" in /data/nginx/proxy_host/2.conf:39');
	});
});
