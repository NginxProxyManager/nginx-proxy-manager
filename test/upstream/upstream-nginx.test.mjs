import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import dgram from "node:dgram";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { prepareUpstreamServers } from "../../backend/lib/upstream-servers.js";
import utils from "../../backend/lib/utils.js";

const binary = process.env.NGINX_BINARY;
const backend = fileURLToPath(new URL("../../backend/", import.meta.url));
const template = fs.readFileSync(path.join(backend, "templates/proxy_host.conf"), "utf8");

async function listen(server) {
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	return server.address().port;
}

test("real Nginx: balancing, cached assets, legacy variables and DNS recovery", {
	skip: !binary,
	timeout: 30000,
}, async (t) => {
	const prefix = fs.mkdtempSync(path.join(os.tmpdir(), "npm-upstream-"));
	t.after(() => fs.rmSync(prefix, { recursive: true, force: true }));
	fs.mkdirSync(path.join(prefix, "logs"));
	fs.mkdirSync(path.join(prefix, "conf.d/include"), { recursive: true });
	for (const file of ["proxy.conf", "assets.conf"]) {
		fs.copyFileSync(
			path.join(backend, "../docker/rootfs/etc/nginx/conf.d/include", file),
			path.join(prefix, "conf.d/include", file),
		);
	}
	const servers = [];
	const ports = [];
	let holdEntered;
	let heldResponse;
	for (const name of ["first", "second", "legacy"]) {
		const server = http.createServer((req, res) => {
			if (req.url === "/hold") {
				heldResponse = res;
				holdEntered(name);
				return;
			}
			if (req.url === "/headers") return res.end(JSON.stringify(req.headers));
			res.end(`${name}:${req.url}`);
		});
		server.on("upgrade", (_req, socket) => {
			socket.end("HTTP/1.1 101 Switching Protocols\r\nConnection: upgrade\r\nUpgrade: websocket\r\n\r\n");
		});
		servers.push(server);
		ports.push(await listen(server));
	}
	t.after(async () => {
		await Promise.all(
			servers.map(
				(server) =>
					new Promise((resolve) => {
						server.closeAllConnections();
						server.close(resolve);
					}),
			),
		);
	});
	const reservation = http.createServer();
	const port = await listen(reservation);
	await new Promise((resolve) => reservation.close(resolve));
	const dns = dgram.createSocket("udp4");
	let resolved = false;
	dns.on("message", (query, remote) => {
		let end = 12;
		while (query[end]) end += query[end] + 1;
		end += 5;
		const header = Buffer.from(query.subarray(0, 12));
		header.writeUInt16BE(resolved ? 0x8180 : 0x8183, 2);
		header.writeUInt16BE(resolved ? 1 : 0, 6);
		header.writeUInt16BE(0, 8);
		header.writeUInt16BE(0, 10);
		const answer = Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 1, 0, 4, 127, 0, 0, 1]);
		dns.send(
			Buffer.concat([header, query.subarray(12, end), ...(resolved ? [answer] : [])]),
			remote.port,
			remote.address,
		);
	});
	dns.bind(0, "127.0.0.1");
	await once(dns, "listening");
	t.after(() => dns.close());

	// Keep logs and temporary files independent of container initialization.
	const nginxArgs = ["-e", path.join(prefix, "error.log"), "-p", `${prefix}/`, "-c", "nginx.conf"];
	const writeConfig = async (upstreams, method = "round_robin", name = null, mode = null) => {
		const host = {
			id: 7,
			enabled: true,
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: ports[2],
			domain_names: ["example.test"],
			upstream_servers: prepareUpstreamServers(upstreams),
			lb_method: method,
			upstream_name: name,
			forwarding_mode: mode,
			use_default_location: true,
			caching_enabled: true,
			allow_websocket_upgrade: true,
			advanced_config: "location /legacy { include conf.d/include/proxy.conf; }",
			locations: "",
		};
		let rendered = await utils.getRenderEngine().parseAndRender(template, host);
		rendered = rendered.replaceAll("listen 80;", `listen 127.0.0.1:${port};`).replaceAll("/data", prefix);
		// Official containers run as root and may not have Nginx's compiled-in
		// default worker user. Keep test workers under the fixture owner's user.
		const workerUser = process.getuid?.() === 0 ? `user ${os.userInfo().username};\n` : "";
		const config = `${workerUser}pid ${prefix}/nginx.pid;
error_log ${prefix}/error.log;
events {}
http {
  access_log ${prefix}/access.log;
  client_body_temp_path ${prefix}/client_temp;
  proxy_temp_path ${prefix}/proxy_temp;
  fastcgi_temp_path ${prefix}/fastcgi_temp;
  uwsgi_temp_path ${prefix}/uwsgi_temp;
  scgi_temp_path ${prefix}/scgi_temp;
  resolver 127.0.0.1:${dns.address().port} valid=1s ipv6=off;
  resolver_timeout 1s;
  map $scheme $x_forwarded_scheme { default $scheme; }
  map $scheme $x_forwarded_proto { default $scheme; }
  log_format proxy '$status';
  proxy_cache_path ${prefix}/cache keys_zone=public-cache:1m;
  ${rendered}
  server { listen 127.0.0.1:${port}; server_name healthy.test; location / { return 204; } }
}`;
		fs.writeFileSync(path.join(prefix, "nginx.conf"), config);
		const check = spawnSync(binary, [...nginxArgs, "-t"], { encoding: "utf8" });
		assert.equal(check.status, 0, check.stderr);
	};
	let child;
	let processErrors = "";
	const stop = async () => {
		if (child && child.exitCode === null && child.signalCode === null) {
			child.kill("SIGTERM");
			await once(child, "exit");
		}
	};
	t.after(stop);
	const request = (url = "/", hostname = "example.test") =>
		new Promise((resolve, reject) => {
			const req = http.get(
				{ hostname: "127.0.0.1", port, path: url, headers: { Host: hostname }, timeout: 1000 },
				(response) => {
					let body = "";
					response.setEncoding("utf8");
					response.on("data", (chunk) => {
						body += chunk;
					});
					response.on("end", () => resolve({ status: response.statusCode, body }));
				},
			);
			req.on("error", reject);
			req.on("timeout", () => req.destroy(new Error("Request timed out")));
		});
	const start = async () => {
		child = spawn(binary, [...nginxArgs, "-g", "daemon off;"], {
			stdio: ["ignore", "ignore", "pipe"],
		});
		child.stderr.on("data", (data) => {
			processErrors += data;
		});
		let lastResponse;
		for (let i = 0; i < 50; i++) {
			try {
				lastResponse = await request("/", "healthy.test");
				if (lastResponse.status === 204) return;
			} catch (err) {
				lastResponse = err.message;
			}
			await delay(50);
		}
		assert.fail(
			JSON.stringify(lastResponse) + processErrors + fs.readFileSync(path.join(prefix, "error.log"), "utf8"),
		);
	};
	const pool = ports.slice(0, 2).map((target) => ({ host: "127.0.0.1", port: target }));
	for (const method of ["round_robin", "least_conn", "ip_hash"]) await writeConfig(pool, method);
	await writeConfig([{ host: "::1", port: ports[0] }]);
	await writeConfig(pool, "round_robin", "my_backend");
	await start();
	const responses = [];
	for (let i = 0; i < 8; i++) responses.push((await request("/path?q=1")).body);
	assert.deepEqual(new Set(responses), new Set(["first:/path?q=1", "second:/path?q=1"]));
	assert.match((await request("/app.css?x=1")).body, /^(first|second):\/app.css\?x=1$/);
	assert.equal((await request("/legacy?q=1")).body, "legacy:/legacy?q=1");
	for (const uri of ["/a%2Fb?q=x%2Fy", "//double//path?q=1"]) {
		assert.ok([`first:${uri}`, `second:${uri}`].includes((await request(uri)).body));
	}
	const forwarded = JSON.parse((await request("/headers")).body);
	assert.equal(forwarded.host, "example.test");
	assert.equal(forwarded["x-forwarded-proto"], "http");
	assert.equal(forwarded["x-real-ip"], "127.0.0.1");
	await new Promise((resolve, reject) => {
		const req = http.request({
			hostname: "127.0.0.1",
			port,
			path: "/socket",
			headers: { Host: "example.test", Connection: "upgrade", Upgrade: "websocket" },
			timeout: 1000,
		});
		req.on("upgrade", (res, socket) => {
			socket.destroy();
			try {
				assert.equal(res.statusCode, 101);
				resolve();
			} catch (error) {
				reject(error);
			}
		});
		req.on("response", (res) => {
			res.resume();
			reject(new Error(`Expected upgrade, got ${res.statusCode}`));
		});
		req.on("error", reject);
		req.on("timeout", () => req.destroy(new Error("WebSocket upgrade timed out")));
		req.end();
	});

	await stop();

	// Verify weights reach Nginx, rather than only checking that both peers respond.
	await writeConfig([{ ...pool[0], weight: 3 }, pool[1]], "round_robin");
	await start();
	const weighted = [];
	for (let i = 0; i < 12; i++) weighted.push((await request("/weighted")).body);
	assert.equal(weighted.filter((body) => body === "first:/weighted").length, 9);
	assert.equal(weighted.filter((body) => body === "second:/weighted").length, 3);
	await stop();

	// Requests from the same client address stay on one peer with ip_hash.
	await writeConfig(pool, "ip_hash");
	await start();
	const sticky = [];
	for (let i = 0; i < 6; i++) sticky.push((await request("/sticky")).body);
	assert.ok(["first:/sticky", "second:/sticky"].includes(sticky[0]));
	assert.equal(new Set(sticky).size, 1);
	await stop();

	// Keep one request active: least_conn must choose the other peer.
	await writeConfig(pool, "least_conn");
	await start();
	const holdReady = new Promise((resolve) => {
		holdEntered = resolve;
	});
	const pending = request("/hold");
	const heldPeer = await Promise.race([
		holdReady,
		pending.then(() => { throw new Error("Held request finished before reaching a backend"); }),
	]);
	try {
		const freePeer = heldPeer === "first" ? "second" : "first";
		for (let i = 0; i < 4; i++) assert.equal((await request("/free")).body, `${freePeer}:/free`);
	} finally {
		heldResponse.end(`${heldPeer}:/hold`);
		await pending;
		await stop();
	}

	// A down peer must never receive traffic.
	await writeConfig([{ ...pool[0], down: true }, pool[1]]);
	await start();
	for (let i = 0; i < 4; i++) assert.equal((await request("/down")).body, "second:/down");
	await stop();

	// Details can select a direct target without discarding the named group.
	await writeConfig(pool, "round_robin", "my_backend", "direct");
	await start();
	assert.equal((await request("/direct?q=1")).body, "legacy:/direct?q=1");
	assert.equal((await request("/direct.css?mode=direct")).body, "legacy:/direct.css?mode=direct");
	await stop();

	// Missing DNS must allow startup and leave unrelated virtual hosts working.
	await writeConfig([
		{ host: "missing.test", port: ports[0] },
		{ host: "127.0.0.1", port: ports[1], backup: true },
	]);
	await start();
	assert.equal((await request("/", "healthy.test")).status, 204);
	assert.equal((await request()).body, "second:/");
	resolved = true;
	let recovered = false;
	for (let i = 0; i < 100; i++) {
		if ((await request()).body === "first:/") {
			recovered = true;
			break;
		}
		await delay(100);
	}
	assert.equal(recovered, true, "DNS backend should recover without regenerating or reloading config");
	await stop();
});
