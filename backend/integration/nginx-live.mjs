import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import dgram from "node:dgram";
import http2 from "node:http2";
import net from "node:net";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { NginxDeploymentCoordinator } from "../internal/nginx-deployment-coordinator.js";
import { buildCandidate } from "../internal/nginx-config-renderer.js";
import utils from "../lib/utils.js";

// This suite runs only in its disposable container. No host ports or data volumes are mounted.
const coordinator = new NginxDeploymentCoordinator();
const servers = [];
let nginx;
let passed = 0;
const results = [];
let originHits = 0;
const catalog = JSON.parse(await fs.readFile(new URL("../config/proxy-directive-catalog.json", import.meta.url), "utf8"));
let configuredOptions = new Set();
let complete = false;
const request = (domain, path = "/", options = {}) => new Promise((resolve, reject) => {
	const transport = options.tls ? https : http;
	const req = transport.request({ hostname: "127.0.0.1", port: options.port || (options.tls ? 443 : 80),
		path, method: options.method || "GET", agent: false, servername: domain,
		...(options.tls ? { ca: options.ca } : {}),
		headers: { Host: domain, ...options.headers } }, (res) => {
		let body = "";
		res.on("data", (chunk) => { body += chunk; });
		res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, trailers: res.trailers, body }));
	});
	req.setTimeout(2000, () => req.destroy(new Error("request timeout")));
	req.on("error", reject);
	req.end(options.body);
});
const eventually = async (check) => {
	let last;
	for (let i = 0; i < 60; i++) {
		try { return await check(); } catch (error) { last = error; await delay(50); }
	}
	throw last;
};
const check = async (name, callback) => {
	configuredOptions = new Set();
	try { await callback(); }
	catch (error) { results.push({ name, status: "failed", error: error.stack || String(error) }); throw error; }
	passed++;
	results.push({ name, status: "passed", options: [...configuredOptions], level: name.startsWith("transport acceptance:") ? "request_acceptance" : "behavior" });
	console.log(`PASS ${passed}: ${name}`);
};
const baseHost = (id, extra = {}) => ({ id, enabled: true, domain_names: [`live-${id}.test`],
	forward_scheme: "http", forward_host: "127.0.0.1", forward_port: 19001,
	certificate_id: 0, access_list_id: 0, locations: [], meta: {},
	nginx_config: { schema_version: 2 }, ...extra });
const workers = async () => {
	const children = (await fs.readFile(`/proc/${nginx.pid}/task/${nginx.pid}/children`, "utf8")).trim().split(/\s+/).filter(Boolean);
	const result = [];
	for (const pid of children) {
		const command = await fs.readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "");
		if (command.includes("worker process") && !command.includes("shutting down")) result.push(pid);
	}
	return result;
};
const deploy = async (host, hostType = "proxy_host", extra = {}) => {
	const previous = await workers();
	const result = await coordinator.deploy({ hostType, host, ...extra });
	// reload sends a signal; wait for replacement workers before comparing policies on the same origin.
	await eventually(async () => {
		const current = await workers();
		assert.ok(current.length && current.every((pid) => !previous.includes(pid)));
	});
	return result;
};
const expectBackend = (domain, backend, path = "/", options = {}) => eventually(async () => {
	const result = await request(domain, path, options);
	assert.equal(result.status, 200, result.body);
	const body = JSON.parse(result.body);
	assert.equal(body.backend, backend);
	return { ...result, json: body };
});

try {
	try { execFileSync("id", ["npm"], { stdio: "ignore" }); }
	catch { execFileSync("useradd", ["-r", "-s", "/bin/false", "npm"]); }
	await import("../scripts/validate-proxy-runtime.js");
	for (const dir of ["/var/log/nginx", "/run/nginx", "/tmp/nginx/body", "/var/lib/nginx/cache/public", "/var/lib/nginx/cache/private",
		"/data/logs", "/data/access", "/data/custom_ssl/npm-1", ...["custom", "default_host", "upstream", "proxy_host", "redirection_host", "dead_host", "temp", "stream"].map((x) => `/data/nginx/${x}`)]) {
		await fs.mkdir(dir, { recursive: true });
	}
	// Container bootstrap normally generates these files before starting nginx.
	await fs.writeFile("/etc/nginx/conf.d/include/resolvers.conf", "resolver 127.0.0.11;\n");
	await fs.writeFile("/etc/nginx/conf.d/include/ip_ranges.conf", "");
	for (const name of ["default.conf", "dev.conf", "production.conf"]) await fs.rm(`/etc/nginx/conf.d/${name}`, { force: true });
	await fs.writeFile("/data/nginx/default_host/fallback.conf", 'server { listen 80 default_server; server_name _; set $server "127.0.0.1"; set $port 80; return 404; }\n');
	const master = await fs.readFile("/etc/nginx/nginx.conf", "utf8");
	await fs.writeFile("/etc/nginx/nginx.conf", master.replace("worker_processes auto;", "worker_processes 1;"));
	for (const [port, backend] of [[19001, "A"], [19002, "B"]]) {
		const server = http.createServer((req, res) => {
			originHits++;
			let body = "";
			req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
				if (req.url === "/accel") res.setHeader("X-Accel-Redirect", "/recovered");
				if (req.url === "/trailers") { res.setHeader("Trailer", "X-End"); res.write("trailer body"); res.addTrailers({ "X-End": "done" }); res.end(); return; }
				if (req.url === "/slow" && backend === "A") { setTimeout(() => res.end("late"), 1200); return; }
				if (req.url === "/status") { res.statusCode = 500; res.end("upstream failure"); return; }
				if (req.url === "/redirect") { res.statusCode = 302; res.setHeader("Location", `http://127.0.0.1:${port}/old/item`); }
				if (req.url === "/cookie") res.setHeader("Set-Cookie", "session=1; Domain=origin.test; Path=/old/");
				if (req.url === "/range") { res.setHeader("Content-Length", "10"); res.end("0123456789"); return; }
				res.setHeader("X-Origin", backend);
				res.setHeader("X-Accel-Test", "visible-if-passed");
				res.end(JSON.stringify({ backend, path: req.url, method: req.method, httpVersion: req.httpVersion, headers: req.headers, body }));
			});
		});
		server.on("upgrade", (req, socket) => {
			const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
			socket.end(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n` + "\x81\x04live");
		});
		await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
		servers.push(server);
	}
	nginx = spawn("/usr/sbin/nginx", [], { stdio: "inherit" });
	await eventually(async () => assert.equal((await request("unknown.test")).status, 404));

	await check("publish: generated domain config routes real requests, bodies and query strings", async () => {
		await deploy(baseHost(1));
		const response = await expectBackend("live-1.test", "A", "/echo?q=1", { method: "POST", body: "payload" });
		assert.equal(response.json.path, "/echo?q=1");
		assert.equal(response.json.method, "POST");
		assert.equal(response.json.body, "payload");
		assert.equal(response.json.headers.host, "live-1.test");
		assert.equal((await request("unknown.test")).status, 404);
	});
	await check("update: reload switches existing domain from backend A to B", async () => {
		await deploy(baseHost(1, { forward_port: 19002 }));
		await expectBackend("live-1.test", "B");
	});
	await check("invalid candidate: real nginx -t rejects it and old traffic still reaches B", async () => {
		const rendered = await buildCandidate({ hostType: "proxy_host", host: baseHost(1) });
		await assert.rejects(deploy(baseHost(1), "proxy_host", { renderResult: { ...rendered, config: rendered.config + "invalid_directive_for_live_test on;\n" } }), /unknown directive/);
		await expectBackend("live-1.test", "B");
	});
	await check("rollback: failure after real reload restores previous config and real traffic", async () => {
		await assert.rejects(deploy(baseHost(1), "proxy_host", { commitApplied: async () => {
			await expectBackend("live-1.test", "A");
			throw new Error("injected persistence failure");
		} }), /injected persistence failure/);
		await expectBackend("live-1.test", "B");
	});
	await check("disable and enable: removed route returns 404 then becomes reachable", async () => {
		await coordinator.remove({ hostType: "proxy_host", host: baseHost(1) });
		await eventually(async () => assert.equal((await request("live-1.test")).status, 404));
		await deploy(baseHost(1));
		await expectBackend("live-1.test", "A");
	});
	await check("custom Location: prefix routes to B while root stays on A", async () => {
		await deploy(baseHost(2, { locations: [{ path: "/api/", forward_scheme: "http", forward_host: "127.0.0.1", forward_port: 19002, nginx_config: {} }] }));
		await expectBackend("live-2.test", "B", "/api/item?x=2");
		await expectBackend("live-2.test", "A", "/other");
	});
	await check("port listener: generated nonstandard port accepts real requests", async () => {
		await deploy(baseHost(3, { domain_names: [], nginx_config: { schema_version: 2, listener: { mode: "port", port: 18080 } } }));
		await expectBackend("anything.test", "A", "/", { port: 18080 });
	});
	await check("upstream: publish group, route through it, update group and observe B", async () => {
		const upstream = { id: 1, nginx_key: "live_pool", name: "Live", servers: [{ host: "127.0.0.1", port: 19001 }] };
		await deploy(upstream, "upstream");
		await deploy(baseHost(4, { default_target: { type: "upstream", scheme: "http", upstream_id: 1 } }), "proxy_host", { dependencies: { upstreams: { 1: { id: 1, nginx_key: "live_pool" } } } });
		await expectBackend("live-4.test", "A");
		await deploy({ ...upstream, servers: [{ host: "127.0.0.1", port: 19002 }] }, "upstream");
		await expectBackend("live-4.test", "B");
	});
	await check("TLS and forced HTTPS: verify certificate, redirect and proxied HTTPS response", async () => {
		execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=live-5.test", "-addext", "subjectAltName=DNS:live-5.test", "-keyout", "/data/custom_ssl/npm-1/privkey.pem", "-out", "/data/custom_ssl/npm-1/fullchain.pem"], { stdio: "ignore" });
		await deploy(baseHost(5, { certificate_id: 1, certificate: { id: 1, provider: "other" }, ssl_forced: true }));
		await eventually(async () => {
			const result = await request("live-5.test", "/secure?x=1");
			assert.equal(result.status, 301);
			assert.equal(result.headers.location, "https://live-5.test/secure?x=1");
		});
		await expectBackend("live-5.test", "A", "/secure", { tls: true, ca: await fs.readFile("/data/custom_ssl/npm-1/fullchain.pem") });
	});
	await check("redirection host: configured status and path preservation affect response", async () => {
		await deploy(baseHost(6, { forward_scheme: "https", forward_domain_name: "destination.test", forward_http_code: 302, preserve_path: true }), "redirection_host");
		await eventually(async () => {
			const result = await request("live-6.test", "/path?q=1");
			assert.equal(result.status, 302);
			assert.equal(result.headers.location, "https://destination.test/path?q=1");
		});
	});
	await check("dead host: replaces a working proxy with a real 404 response", async () => {
		await coordinator.remove({ hostType: "proxy_host", host: baseHost(1) });
		await deploy(baseHost(1), "dead_host");
		await eventually(async () => assert.equal((await request("live-1.test")).status, 404));
	});
	await check("TCP stream: generated stream forwards bytes to the upstream HTTP server", async () => {
		await deploy({ id: 1, enabled: true, incoming_port: 18081, forwarding_host: "127.0.0.1", forwarding_port: 19002, tcp_forwarding: true, udp_forwarding: false }, "stream");
		await expectBackend("stream.test", "B", "/stream", { port: 18081 });
	});
	for (const [match_type, path, url, other] of [
		["exact", "/exact", "/exact", "/exact/child"],
		["regex", "^/Case/[0-9]+$", "/Case/12", "/case/12"],
		["regex_i", "^/Case/[0-9]+$", "/case/12", "/different"],
		["priority_prefix", "/priority/", "/priority/item", "/different"],
	]) await check(`Location ${match_type}: matching and nonmatching requests`, async () => {
		await deploy(baseHost(20, { locations: [{ match_type, path, path_mode: "preserve_uri", forward_scheme: "http", forward_host: "127.0.0.1", forward_port: 19002 }] }));
		await expectBackend("live-20.test", "B", url);
		await expectBackend("live-20.test", "A", other);
	});
	for (const [path_mode, expected] of [["strip_prefix", "/item?x=1"], ["replace_prefix", "/new/item?x=1"]]) {
		await check(`Location ${path_mode}: upstream receives rewritten URI and query`, async () => {
			await deploy(baseHost(21, { locations: [{ path: "/api/", path_mode, forward_path: "/new/", forward_scheme: "http", forward_host: "127.0.0.1", forward_port: 19002 }] }));
			const response = await expectBackend("live-21.test", "B", "/api/item?x=1");
			assert.equal(response.json.path, expected);
		});
	}
	const optionsHost = (directives = {}, headers = {}) => {
		for (const entry of catalog.directives) {
			if (Object.hasOwn(entry.storage.section === "headers" ? headers : directives, entry.storage.key)) configuredOptions.add(entry.key);
		}
		return baseHost(30, { nginx_config: { schema_version: 2, server: { directives, headers } } });
	};
	await check("proxy_method and proxy_http_version: upstream sees overridden method and HTTP/1.0", async () => {
		await deploy(optionsHost({ proxy_method: "PUT", proxy_http_version: "1.0" }));
		const response = await expectBackend("live-30.test", "A");
		assert.equal(response.json.method, "PUT");
		assert.equal(response.json.httpVersion, "1.0");
	});
	await check("request and response headers: set, hide and pass rules affect wire headers", async () => {
		await deploy(optionsHost({}, { request: [{ name: "X-Live", operation: "set", value: "configured" }], response: [{ name: "X-Result", operation: "set", value: "configured" }], hide_response: ["X-Origin"] }));
		const response = await expectBackend("live-30.test", "A");
		assert.equal(response.json.headers["x-live"], "configured");
		assert.equal(response.headers["x-result"], "configured");
		assert.equal(response.headers["x-origin"], undefined);
	});
	await check("proxy_pass_request_headers off: arbitrary client header is removed", async () => {
		await deploy(optionsHost({ proxy_pass_request_headers: false }));
		const response = await expectBackend("live-30.test", "A", "/", { headers: { "X-Client": "secret" } });
		assert.equal(response.json.headers["x-client"], undefined);
	});
	await check("client_max_body_size: oversized request receives 413", async () => {
		await deploy(optionsHost({ client_max_body_size: "1k" }));
		await eventually(async () => assert.equal((await request("live-30.test", "/", { method: "POST", body: "x".repeat(2048) })).status, 413));
	});
	await check("proxy_read_timeout: slow origin returns 504", async () => {
		await deploy(optionsHost({ proxy_read_timeout: "100ms", proxy_next_upstream: ["off"] }));
		await eventually(async () => assert.equal((await request("live-30.test", "/slow")).status, 504));
	});
	await check("proxy_intercept_errors: configured error_page replaces upstream 500", async () => {
		await deploy({ ...optionsHost({ proxy_intercept_errors: true }), advanced_config: 'error_page 500 =200 /recovered;', locations: [{ path: "/recovered", match_type: "exact", forward_scheme: "http", forward_host: "127.0.0.1", forward_port: 19001 }] });
		await eventually(async () => {
			const response = await request("live-30.test", "/status");
			assert.equal(response.status, 200);
			assert.equal(JSON.parse(response.body).path, "/recovered");
		});
	});
	await check("proxy_redirect: upstream Location is rewritten", async () => {
		await deploy({ ...optionsHost({ proxy_redirect: "default" }), locations: [{ path: "/", forward_scheme: "http", forward_host: "127.0.0.1", forward_port: 19001 }] });
		await eventually(async () => assert.equal((await request("live-30.test", "/redirect")).headers.location, "http://live-30.test/old/item"));
	});
	await check("IP access list: forbidden source receives 403", async () => {
		await deploy(baseHost(40, { access_list_id: 1, access_list: { id: 1, items: [], clients: [{ address: "192.0.2.0/24", directive: "allow" }], satisfy_any: false } }));
		await eventually(async () => assert.equal((await request("live-40.test")).status, 403));
	});
	await check("Basic auth: absent and invalid credentials denied, valid credentials accepted", async () => {
		const hash = execFileSync("openssl", ["passwd", "-apr1", "live-password"], { encoding: "utf8" }).trim();
		await fs.writeFile("/data/access/2", `live:${hash}\n`);
		await deploy(baseHost(41, { access_list_id: 2, access_list: { id: 2, items: [{ username: "live" }], clients: [], satisfy_any: false, pass_auth: false } }));
		await eventually(async () => assert.equal((await request("live-41.test")).status, 401));
		assert.equal((await request("live-41.test", "/", { headers: { Authorization: "Basic " + Buffer.from("live:bad").toString("base64") } })).status, 401);
		const response = await expectBackend("live-41.test", "A", "/", { headers: { Authorization: "Basic " + Buffer.from("live:live-password").toString("base64") } });
		assert.equal(response.json.headers.authorization, undefined);
	});
	await check("UDP stream: generated stream forwards a datagram and returns the reply", async () => {
		const origin = dgram.createSocket("udp4");
		origin.on("message", (message, peer) => origin.send(Buffer.concat([Buffer.from("reply:"), message]), peer.port, peer.address));
		await new Promise((resolve) => origin.bind(19003, "127.0.0.1", resolve));
		try {
			await deploy({ id: 2, enabled: true, incoming_port: 18082, forwarding_host: "127.0.0.1", forwarding_port: 19003, tcp_forwarding: false, udp_forwarding: true }, "stream");
			await eventually(() => new Promise((resolve, reject) => {
				const client = dgram.createSocket("udp4");
				const timeout = setTimeout(() => { client.close(); reject(new Error("UDP timeout")); }, 500);
				client.on("message", (message) => { clearTimeout(timeout); client.close(); try { assert.equal(message.toString(), "reply:live"); resolve(); } catch (error) { reject(error); } });
				client.send("live", 18082, "127.0.0.1");
			}));
		} finally { origin.close(); }
	});
	await check("cookie domain and path rewrite: response cookie contains configured values", async () => {
		await deploy(optionsHost({ proxy_cookie_domain: [{ from: "origin.test", to: "public.test" }], proxy_cookie_path: [{ from: "/old/", to: "/new/" }] }));
		const response = await request("live-30.test", "/cookie");
		assert.match(response.headers["set-cookie"][0], /Domain=public.test; Path=\/new\//);
	});
	await check("proxy_force_ranges: origin without range support returns requested bytes", async () => {
		await deploy(optionsHost({ proxy_force_ranges: true }));
		const response = await request("live-30.test", "/range", { headers: { Range: "bytes=2-5" } });
		assert.equal(response.status, 206);
		assert.equal(response.body, "2345");
	});
	await check("proxy_pass_request_body off: upstream receives no client body", async () => {
		await deploy(optionsHost({ proxy_pass_request_body: false }, { request: [{ name: "Content-Length", operation: "remove" }] }));
		const response = await expectBackend("live-30.test", "A", "/", { method: "POST", body: "discard" });
		assert.equal(response.json.body, "");
	});
	await check("proxy_pass_header: normally hidden X-Accel header reaches client", async () => {
		await deploy(optionsHost({}, { pass_response: ["X-Accel-Test"] }));
		assert.equal((await request("live-30.test")).headers["x-accel-test"], "visible-if-passed");
	});
	await check("HTTPS upstream: SNI, trusted certificate and configured TLS protocol", async () => {
		const cert = await fs.readFile("/data/custom_ssl/npm-1/fullchain.pem");
		await fs.appendFile("/etc/ssl/certs/ca-certificates.crt", cert);
		const origin = https.createServer({ cert, key: await fs.readFile("/data/custom_ssl/npm-1/privkey.pem") }, (req, res) => {
			res.end(JSON.stringify({ backend: "TLS", servername: req.socket.servername, protocol: req.socket.getProtocol() }));
		});
		await new Promise((resolve) => origin.listen(19004, "127.0.0.1", resolve));
		servers.push(origin);
		const tlsHost = { ...optionsHost({ proxy_ssl_server_name: true, proxy_ssl_name: "live-5.test", proxy_ssl_verify: true, proxy_ssl_verify_depth: 2, proxy_ssl_protocols: ["TLSv1.2"], proxy_ssl_session_reuse: false, proxy_ssl_ciphers: "HIGH:!aNULL:!MD5" }), forward_scheme: "https", forward_port: 19004 };
		await deploy(tlsHost);
		const response = await expectBackend("live-30.test", "TLS");
		assert.equal(response.json.servername, "live-5.test");
		assert.equal(response.json.protocol, "TLSv1.2");
		tlsHost.nginx_config.server.directives.proxy_ssl_name = "wrong.test";
		await deploy(tlsHost);
		assert.equal((await request("live-30.test")).status, 502);
	});
	await check("HTTP/2 and HSTS: authenticated TLS negotiation returns HTTP/2 and HSTS header", async () => {
		await deploy(baseHost(5, { certificate_id: 1, certificate: { id: 1, provider: "other" }, ssl_forced: true, http2_support: true, hsts_enabled: true, hsts_subdomains: true }));
		const client = http2.connect("https://127.0.0.1", { servername: "live-5.test", ca: await fs.readFile("/data/custom_ssl/npm-1/fullchain.pem") });
		try {
			await new Promise((resolve, reject) => {
				client.on("error", reject);
				const stream = client.request({ ":authority": "live-5.test", ":path": "/" });
				stream.on("response", (headers) => {
					try { assert.equal(headers[":status"], 200); assert.match(headers["strict-transport-security"], /includeSubDomains/i); assert.equal(client.alpnProtocol, "h2"); } catch (error) { reject(error); }
				});
				stream.resume(); stream.on("end", resolve); stream.on("error", reject); stream.end();
			});
		} finally { client.destroy(); }
	});
	// Transport/resource options need load and fault tests in addition to this real-request acceptance check.
	for (const [label, directives] of [
		["buffer allocation and disk limits", { proxy_buffer_size: "16k", proxy_buffers: [8, "16k"], proxy_busy_buffers_size: "32k", proxy_max_temp_file_size: "16m", proxy_temp_file_write_size: "32k" }],
		["unbuffered streaming", { proxy_buffering: false, proxy_request_buffering: false }],
		["socket binding and keepalive", { proxy_bind: "127.0.0.1", proxy_socket_keepalive: true }],
		["timeouts and retry budget", { proxy_connect_timeout: "2s", proxy_send_timeout: "2s", proxy_next_upstream: ["error", "timeout", "http_502"], proxy_next_upstream_timeout: "3s", proxy_next_upstream_tries: 2 }],
		["header hash sizing and read limit", { proxy_headers_hash_bucket_size: 128, proxy_headers_hash_max_size: 1024, proxy_limit_rate: "1m", proxy_ignore_client_abort: true }],
		["trailers enabled", { proxy_pass_trailers: true }],
	]) await check(`transport acceptance: ${label}`, async () => {
		await deploy(optionsHost(directives));
		const response = await expectBackend("live-30.test", "A", "/", { method: "POST", body: "live" });
		assert.equal(response.json.body, "live");
	});
	await check("WebSocket: real upgrade handshake and server frame reach the client", async () => {
		await deploy(baseHost(50, { allow_websocket_upgrade: true }));
		await new Promise((resolve, reject) => {
			const socket = net.connect(80, "127.0.0.1", () => socket.write("GET /ws HTTP/1.1\r\nHost: live-50.test\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n"));
			let data = "";
			socket.setTimeout(2000, () => socket.destroy(new Error("WebSocket timeout")));
			socket.on("error", reject);
			socket.on("data", (chunk) => { data += chunk.toString("latin1"); });
			socket.on("end", () => { try { assert.match(data, /101 Switching Protocols/); assert.match(data, /s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/); assert.ok(data.endsWith("\x81\x04live")); resolve(); } catch (error) { reject(error); } });
		});
	});
	await check("asset caching: repeated asset request is served without a second origin request", async () => {
		await deploy(baseHost(51, { caching_enabled: true }));
		const before = originHits;
		await expectBackend("live-51.test", "A", "/unique-live.css");
		await expectBackend("live-51.test", "A", "/unique-live.css");
		assert.equal(originHits - before, 1);
	});
	await check("block exploits: matching user agent denied while normal request passes", async () => {
		await deploy(baseHost(52, { block_exploits: true }));
		assert.equal((await request("live-52.test", "/", { headers: { "User-Agent": "libwww-perl" } })).status, 403);
		await expectBackend("live-52.test", "A");
	});
	await check("upstream retry and backup: unavailable primary falls back to healthy backup", async () => {
		await deploy({ id: 2, nginx_key: "failover_pool", servers: [{ host: "127.0.0.1", port: 19999, max_fails: 1, fail_timeout: "1s" }, { host: "127.0.0.1", port: 19002, backup: true }] }, "upstream");
		await deploy(baseHost(53, { default_target: { type: "upstream", scheme: "http", upstream_id: 2 }, nginx_config: { schema_version: 2, server: { directives: { proxy_next_upstream: ["error", "timeout"], proxy_next_upstream_tries: 2, proxy_next_upstream_timeout: "2s" } } } }), "proxy_host", { dependencies: { upstreams: { 2: { nginx_key: "failover_pool" } } } });
		await expectBackend("live-53.test", "B");
	});
	await check("proxy_ignore_headers: ignored X-Accel-Redirect stays an origin response", async () => {
		await deploy(optionsHost({}, { ignore_upstream: ["X-Accel-Redirect"] }));
		const response = await expectBackend("live-30.test", "A", "/accel");
		assert.equal(response.json.path, "/accel");
	});
	await check("proxy_pass_trailers: on forwards origin trailer, off removes it", async () => {
		for (const enabled of [true, false]) {
			await deploy(optionsHost({ proxy_pass_trailers: enabled }, { request: [{ name: "Connection", operation: "set", value: "TE" }, { name: "TE", operation: "set", value: "trailers" }] }));
			const response = await request("live-30.test", "/trailers", { headers: { TE: "trailers", Connection: "TE" } });
			assert.equal(response.body, "trailer body");
			assert.equal(response.trailers["x-end"], enabled ? "done" : undefined);
		}
	});
	await check("default site: redirect, HTML, 404 and connection-close modes affect unmatched requests", async () => {
		await fs.writeFile("/data/nginx/default_host/fallback.conf", 'server { listen 80; server_name fallback.test; set $server "127.0.0.1"; set $port 80; return 404; }\n');
		await deploy({ value: "redirect", meta: { redirect: "https://destination.test/" } }, "default");
		assert.equal((await request("unmatched.test")).headers.location, "https://destination.test/");
		await fs.mkdir("/data/nginx/default_www", { recursive: true });
		await fs.writeFile("/data/nginx/default_www/index.html", "live default page");
		await deploy({ value: "html" }, "default");
		assert.equal((await request("unmatched.test")).body, "live default page");
		await deploy({ value: "404" }, "default");
		assert.equal((await request("unmatched.test")).status, 404);
		await deploy({ value: "444" }, "default");
		await assert.rejects(request("unmatched.test"), /socket hang up|ECONNRESET/);
	});
	for (const method of ["round_robin", "least_conn", "ip_hash", "random"]) {
		await check(`upstream ${method}: live pool accepts requests and respects down servers`, async () => {
			await deploy({ id: 3, nginx_key: "method_pool", load_balancing_method: method, zone_size: "128k", servers: [{ host: "127.0.0.1", port: 19001, down: true }, { host: "127.0.0.1", port: 19002, weight: 2, max_conns: 100 }] }, "upstream");
			await deploy(baseHost(54, { default_target: { type: "upstream", scheme: "http", upstream_id: 3 } }), "proxy_host", { dependencies: { upstreams: { 3: { nginx_key: "method_pool" } } } });
			await expectBackend("live-54.test", "B");
		});
	}
	await check("default Location disabled: custom route works while unmatched path returns 404", async () => {
		await deploy(baseHost(55, { nginx_config: { schema_version: 2, server: { directives: { default_location_enabled: false } } }, locations: [{ path: "/only", match_type: "exact", forward_scheme: "http", forward_host: "127.0.0.1", forward_port: 19002 }] }));
		await expectBackend("live-55.test", "B", "/only");
		assert.equal((await request("live-55.test", "/missing")).status, 404);
	});
	await check("retry count and total timeout: exhausted budgets prevent fallback, sufficient budgets reach B", async () => {
		await deploy({ id: 4, nginx_key: "budget_pool", servers: [{ host: "127.0.0.1", port: 19001, max_fails: 0 }, { host: "127.0.0.1", port: 19002, backup: true }] }, "upstream");
		for (const [tries, timeout, status] of [[1, "2s", 504], [2, "50ms", 504], [2, "2s", 200]]) {
			const host = { ...optionsHost({ proxy_read_timeout: "100ms", proxy_next_upstream: ["error", "timeout"], proxy_next_upstream_tries: tries, proxy_next_upstream_timeout: timeout }), default_target: { type: "upstream", scheme: "http", upstream_id: 4 } };
			await deploy(host, "proxy_host", { dependencies: { upstreams: { 4: { nginx_key: "budget_pool" } } } });
			const response = await request("live-30.test", "/slow");
			assert.equal(response.status, status);
			if (status === 200) assert.equal(JSON.parse(response.body).backend, "B");
		}
	});
	await coordinator.testOnly();
	const coveredOptions = new Set(results.flatMap((result) => result.options || []));
	assert.deepEqual(catalog.directives.map((entry) => entry.key).filter((key) => !coveredOptions.has(key)), [], "Every supported catalog option needs an explicit setting exercised by a real request");
	console.log(`Catalog options explicitly exercised: ${coveredOptions.size}/${catalog.directives.length}; see per-scenario acceptance/behavior levels in results.json.`);
	console.log(`Real Nginx scenarios: ${passed}/${passed} passed (no mocked nginx commands).`);
	complete = true;
} finally {
	await fs.mkdir("/results", { recursive: true });
	await fs.writeFile("/results/results.json", JSON.stringify({ complete, version: "1.31.1.1", architecture: process.arch, timestamp: new Date().toISOString(), passed, catalog: catalog.directives.map(({ key }) => ({ key, scenarios: results.filter((result) => result.options?.includes(key)).map(({ name, level }) => ({ name, level })) })), results }, null, 2));
	if (nginx) {
		await utils.execFileResult("/usr/sbin/nginx", ["-s", "quit"]).catch(() => undefined);
		nginx.kill("SIGTERM");
	}
	for (const server of servers) { server.closeAllConnections(); server.close(); }
}
