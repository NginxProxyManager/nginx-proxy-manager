import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	collectHiddenTargets,
	containersToCandidates,
	createDockerClient,
	describeDockerError,
	discoverDocker,
	isAllowedPath,
	isValidLabelDomain,
	looksLikeSelf,
	parseDockerHost,
	parseLabelDomains,
	splitLabelDomains,
	parseMountinfoContainerId,
	parseNpmLabels,
	usableNames,
} from "../lib/upstream/docker.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "docker");
const selfJson = JSON.parse(fs.readFileSync(path.join(fixtures, "self.json"), "utf8"));
const containersJson = JSON.parse(fs.readFileSync(path.join(fixtures, "containers.json"), "utf8"));
const SELF_ID = selfJson.Id;
// NPM's own interfaces inside its container (matches self.json)
const SELF_INTERFACES = { eth0: [{ address: "172.18.0.2", family: "IPv4", internal: false }] };

/**
 * Fake Docker Engine API serving fixture JSON. Records every request.
 */
const createFakeDocker = (opts = {}) => {
	const requests = [];
	const server = http.createServer((req, res) => {
		requests.push({ method: req.method, url: req.url });
		const url = new URL(req.url, "http://docker");
		const send = (status, body) => {
			res.writeHead(status, { "Content-Type": "application/json" });
			res.end(typeof body === "string" ? body : JSON.stringify(body));
		};
		if (opts.handler?.(req, res, url)) {
			return;
		}
		if (req.method !== "GET") {
			return send(405, { message: "method not allowed" });
		}
		if (url.pathname === "/version") {
			return send(200, { ApiVersion: "1.47", Version: "27.0.0" });
		}
		const inspect = /^\/containers\/([^/]+)\/json$/.exec(url.pathname);
		if (inspect) {
			const known = opts.knownIds || [SELF_ID, SELF_ID.slice(0, 12)];
			if (known.includes(inspect[1])) {
				return send(200, selfJson);
			}
			return send(404, { message: `No such container: ${inspect[1]}` });
		}
		if (url.pathname === "/containers/json") {
			const filters = url.searchParams.get("filters");
			if (filters) {
				const parsed = JSON.parse(filters);
				const wanted = new Set(parsed.network || []);
				return send(
					200,
					containersJson.filter((c) => Object.keys(c.NetworkSettings.Networks).some((n) => wanted.has(n))),
				);
			}
			return send(200, containersJson);
		}
		return send(404, { message: "page not found" });
	});
	return { server, requests };
};

const listen = (server, target) =>
	new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(target, () => resolve(server.address()));
	});

describe("docker: DOCKER_HOST parsing and allowlist", () => {
	it("parses unix and tcp forms", () => {
		assert.deepEqual(parseDockerHost("unix:///var/run/docker.sock"), { socketPath: "/var/run/docker.sock" });
		assert.deepEqual(parseDockerHost("tcp://socket-proxy:2375"), { host: "socket-proxy", port: 2375 });
		assert.deepEqual(parseDockerHost("tcp://10.0.0.1"), { host: "10.0.0.1", port: 2375 });
		assert.deepEqual(parseDockerHost("http://[::1]:2376"), { host: "::1", port: 2376 });
		assert.throws(() => parseDockerHost("ssh://user@host"), /not supported/);
		assert.throws(() => parseDockerHost("unix://relative.sock"), /absolute/);
	});

	it("only allows read-only discovery paths", () => {
		assert.equal(isAllowedPath("/version"), true);
		assert.equal(isAllowedPath("/containers/json"), true);
		assert.equal(isAllowedPath("/containers/json?filters=%7B%22network%22%3A%5B%22a%22%5D%7D"), true);
		assert.equal(isAllowedPath(`/containers/${SELF_ID}/json`), true);
		assert.equal(isAllowedPath("/networks/npm_default"), true);
		assert.equal(isAllowedPath("/containers/create"), false);
		assert.equal(isAllowedPath("/containers/abc/exec"), false);
		assert.equal(isAllowedPath("/containers/../exec/json"), false);
		assert.equal(isAllowedPath("/images/json"), false);
		assert.equal(isAllowedPath("/v1.47/containers/json"), false);
		assert.equal(isAllowedPath("/containers/json?all=1&x=/../"), false);
	});

	it("finds the container id in mountinfo", () => {
		const line = `612 590 0:33 /docker/containers/${SELF_ID}/hostname /etc/hostname rw,relatime - ext4 /dev/sda1 rw`;
		assert.equal(parseMountinfoContainerId(`foo\n${line}\nbar`), SELF_ID);
		assert.equal(parseMountinfoContainerId("0::/\n"), null);
	});

	it("reads npm.* labels only", () => {
		const none = {
			domains: [],
			ignored_domains: [],
			websocket: null,
			block_exploits: null,
			caching: null,
			http2: null,
		};
		assert.deepEqual(parseNpmLabels({ "npm.port": "8080", "npm.scheme": "HTTPS", "npm.hide": "no" }), {
			hide: false,
			port: 8080,
			scheme: "https",
			...none,
		});
		assert.deepEqual(parseNpmLabels({ "npm.port": "99999", "npm.scheme": "ftp", "npm.hide": "true" }), {
			hide: true,
			port: null,
			scheme: null,
			...none,
		});
		assert.deepEqual(parseNpmLabels(null), { hide: false, port: null, scheme: null, ...none });
	});

	it("reads the one-click labels and ignores invalid values", () => {
		assert.deepEqual(
			parseNpmLabels({
				"npm.domain": " App.Example.com, www.example.com  app.example.com,,",
				"npm.port": " 3000 ",
				"npm.websocket": "TRUE",
				"npm.block_exploits": "1",
				"npm.caching": "off",
				"npm.http2": "maybe",
			}),
			{
				hide: false,
				port: 3000,
				scheme: null,
				domains: ["app.example.com", "www.example.com"],
				ignored_domains: [],
				websocket: true,
				block_exploits: true,
				caching: false,
				http2: null,
			},
		);
		assert.equal(parseNpmLabels({ "npm.port": "80abc" }).port, null);
		assert.equal(parseNpmLabels({ "npm.port": "0" }).port, null);
	});

	it("keeps only domains the domain names field would accept", () => {
		assert.deepEqual(
			parseLabelDomains(
				"*.example.com a.b ok.example.com bad;rm.example.com x .lead.com trail.com. dou..ble.com -h.com h-.com " +
					"münchen.example.com under_score.example.com $(id).com a/b.com",
			),
			["*.example.com", "a.b", "ok.example.com", "münchen.example.com", "under_score.example.com"],
		);
		// single leading wildcard in front of two or more labels only (the proxy host field refuses "*.com")
		for (const bad of [
			"*.com",
			"*",
			"*.",
			"**.example.com",
			"*.*.example.com",
			"a.*.example.com",
			"www.example.*",
			"*example.com",
		]) {
			assert.equal(isValidLabelDomain(bad), false, bad);
		}
		assert.equal(isValidLabelDomain("*.sub.example.com"), true);
		assert.equal(isValidLabelDomain("*.-bad.example.com"), false);
		assert.deepEqual(parseLabelDomains(undefined), []);
		assert.deepEqual(parseLabelDomains(42), []);
		assert.equal(isValidLabelDomain(`${"a".repeat(64)}.com`), false);
		const many = Array.from({ length: 150 }, (_, i) => `d${i}.example.com`).join(",");
		assert.equal(parseLabelDomains(many).length, 100);
	});

	it("reports the npm.domain entries it drops", () => {
		assert.deepEqual(splitLabelDomains("*.com, ok.example.com bad;rm.example.com *.com OK.example.com"), {
			domains: ["ok.example.com"],
			ignored: ["*.com", "bad;rm.example.com"],
		});
		assert.deepEqual(splitLabelDomains(undefined), { domains: [], ignored: [] });
		const junk = Array.from({ length: 20 }, (_, i) => `bad${i}!.com`).join(" ");
		assert.equal(splitLabelDomains(junk).ignored.length, 10);
		assert.equal(splitLabelDomains(`${"x".repeat(300)}!`).ignored[0].length, 100);
		assert.deepEqual(parseNpmLabels({ "npm.domain": "*.com" }).ignored_domains, ["*.com"]);
		assert.deepEqual(parseNpmLabels({ "npm.domain": "*.com" }).domains, []);
	});
});

describe("docker: candidate parsing from fixture JSON", () => {
	const items = containersToCandidates(containersJson, { networks: ["npm_default", "proxy"], selfId: SELF_ID });
	const byHost = Object.fromEntries(items.map((i) => [i.host, i]));

	it("skips itself and hidden containers", () => {
		assert.equal(byHost["npm-app-1"], undefined);
		assert.equal(byHost.app, undefined);
		assert.equal(byHost["hidden-db"], undefined);
	});

	it("collects the names and IPs of hidden containers, for the other providers", () => {
		const hidden = collectHiddenTargets(containersJson, { selfId: SELF_ID });
		assert.deepEqual([...hidden.hosts], ["hidden-db"]);
		assert.deepEqual([...hidden.ips], ["172.18.0.5"]);
	});

	it("collects every name, the compose service and the IPs on all networks of a hidden container", () => {
		const hidden = collectHiddenTargets(
			[
				{
					Id: "f".repeat(64),
					Names: ["/Proj-Secret-1", "/bad name"],
					Labels: { "npm.hide": "yes", "com.docker.compose.service": "secret" },
					NetworkSettings: {
						Networks: { npm_default: { IPAddress: "172.18.0.9" }, other: { IPAddress: "10.1.0.9" } },
					},
				},
				// NPM itself is never hidden from anything
				{ Id: SELF_ID, Names: ["/npm"], Labels: { "npm.hide": "true" }, NetworkSettings: { Networks: {} } },
				{ Id: "1".repeat(64), Names: ["/shown"], Labels: { "npm.hide": "false" } },
				null,
				"junk",
			],
			{ selfId: SELF_ID },
		);
		assert.deepEqual([...hidden.hosts].sort(), ["proj-secret-1", "secret"]);
		assert.deepEqual([...hidden.ips].sort(), ["10.1.0.9", "172.18.0.9"]);
		assert.deepEqual(collectHiddenTargets(null), { hosts: new Set(), ips: new Set() });
	});

	it("returns container names and compose service aliases", () => {
		assert.equal(byHost["myproj-web-1"].label, "myproj-web-1 (container)");
		assert.equal(byHost.web.label, "web (compose service of myproj-web-1)");
		assert.deepEqual(byHost.web.ports, [3000]);
		assert.equal(byHost.web.hint_port, 3000);
		assert.equal(byHost.web.network, "npm_default");
		assert.equal(byHost.web.ip, "172.18.0.3");
		assert.equal(byHost.web.state, "running");
		assert.equal(byHost.web.source, "docker");
	});

	it("honours npm.port / npm.scheme and keeps only TCP ports", () => {
		const g = byHost.grafana;
		assert.deepEqual(g.ports, [3000, 3001, 9100]);
		assert.equal(g.hint_port, 3001);
		assert.equal(g.hint_scheme, "https");
		assert.equal(g.network, "proxy");
		assert.equal(g.ip, "172.20.0.4");
	});

	it("gives no port hint without a single port", () => {
		assert.deepEqual(byHost.worker.ports, []);
		assert.equal(byHost.worker.hint_port, null);
	});

	it("never leaks env, command, mounts or foreign labels", () => {
		const json = JSON.stringify(items);
		assert.doesNotMatch(json, /hunter2|secret|traefik|Mounts|Command|Labels/);
		const keys = [
			"hint_port",
			"hint_scheme",
			"host",
			"ip",
			"label",
			"network",
			"ports",
			"source",
			"state",
			"used_by",
		];
		for (const item of items) {
			// container items carry the label suggestion, compose service aliases don't
			const expected = item.label.endsWith("(container)") ? [...keys, "suggestion"].sort() : keys;
			assert.deepEqual(Object.keys(item).sort(), expected);
		}
	});

	it("suggests a proxy host from the labels on the container item only", () => {
		assert.deepEqual(byHost["myproj-web-1"].suggestion, {
			domain_names: [],
			forward_scheme: "http",
			forward_host: "myproj-web-1",
			forward_port: 3000,
			allow_websocket_upgrade: false,
			block_exploits: false,
			caching_enabled: false,
			http2_support: false,
			ignored_domains: [],
			existing_host_id: null,
			existing_host_type: null,
		});
		assert.equal(byHost.web.suggestion, undefined);
		assert.equal(byHost.grafana.suggestion.forward_scheme, "https");
		assert.equal(byHost.grafana.suggestion.forward_port, 3001);
		assert.equal(byHost.worker.suggestion.forward_port, null);

		const [labelled] = containersToCandidates(
			[
				{
					Id: "f".repeat(64),
					Names: ["/blog"],
					Labels: {
						"npm.domain": "blog.example.com,www.blog.example.com *.com",
						"npm.port": "2368",
						"npm.scheme": "http",
						"npm.websocket": "true",
						"npm.block_exploits": "yes",
						"npm.caching": "true",
						"npm.http2": "on",
					},
					State: "exited",
					Ports: [],
					NetworkSettings: { Networks: { npm_default: { IPAddress: "172.18.0.9" } } },
				},
			],
			{ networks: ["npm_default"] },
		);
		assert.deepEqual(labelled.suggestion, {
			domain_names: ["blog.example.com", "www.blog.example.com"],
			forward_scheme: "http",
			forward_host: "blog",
			forward_port: 2368,
			allow_websocket_upgrade: true,
			block_exploits: true,
			caching_enabled: true,
			http2_support: true,
			ignored_domains: ["*.com"],
			existing_host_id: null,
			existing_host_type: null,
		});
		assert.equal(labelled.state, "exited");
	});

	it("drops legacy link names and invalid hosts", () => {
		assert.deepEqual(usableNames(["/web/db", "/db"]), ["db"]);
		assert.deepEqual(usableNames(["/a b", "/x;y", "/"]), []);
		const linked = containersToCandidates(
			[{ Id: "b".repeat(64), Names: ["/web/db", "/db"], Ports: [], NetworkSettings: { Networks: {} } }],
			{ networks: [] },
		);
		assert.deepEqual(
			linked.map((i) => i.host),
			["db"],
		);
		const onlyLinks = containersToCandidates([{ Id: "c".repeat(64), Names: ["/web/db"] }], { networks: [] });
		assert.deepEqual(onlyLinks, []);
	});

	it("tolerates garbage", () => {
		assert.deepEqual(containersToCandidates(null, { networks: [] }), []);
		assert.deepEqual(containersToCandidates([null, 1, { Names: [] }], { networks: [] }), []);
	});
});

describe("docker: client against a fake API on a unix socket", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "npm-docker-test-"));
	const socketPath = path.join(dir, "docker.sock");
	const fake = createFakeDocker();

	before(() => listen(fake.server, socketPath));
	after(() => {
		fake.server.close();
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("discovers peers via hostname lookup", async () => {
		fake.requests.length = 0;
		const result = await discoverDocker({
			dockerHost: `unix://${socketPath}`,
			hostname: SELF_ID.slice(0, 12),
			interfaces: SELF_INTERFACES,
		});
		assert.equal(result.selfId, SELF_ID);
		assert.deepEqual(result.networks, ["npm_default", "proxy"]);
		const hosts = result.items.map((i) => i.host).sort();
		assert.deepEqual(hosts, ["grafana", "myproj-web-1", "web", "worker"]);
		// the hidden container is left out here and reported for the DNS results
		assert.deepEqual([...result.hidden.hosts], ["hidden-db"]);
		assert.deepEqual([...result.hidden.ips], ["172.18.0.5"]);
		assert.ok(fake.requests.every((r) => r.method === "GET"));
		const listCall = fake.requests.find((r) => r.url.startsWith("/containers/json?"));
		assert.ok(listCall, "lists containers filtered by network");
	});

	it("ignores a hostname match that shares none of our addresses", async () => {
		// NPM's hostname was set to another container's name: the inspect succeeds but is not us
		const result = await discoverDocker({
			dockerHost: `unix://${socketPath}`,
			hostname: SELF_ID.slice(0, 12),
			readMountinfo: () => "",
			interfaces: { eth0: [{ address: "10.9.9.9", family: "IPv4", internal: false }] },
		}).catch((err) => err);
		assert.equal(result.code, "ESELF");
	});

	it("verifies a hostname match against our addresses", () => {
		assert.equal(looksLikeSelf(selfJson, ["172.20.0.2"]), true);
		assert.equal(looksLikeSelf(selfJson, ["10.0.0.1"]), false);
		assert.equal(looksLikeSelf({ NetworkSettings: { Networks: { host: { IPAddress: "" } } } }, []), true);
	});

	it("falls back to mountinfo when the hostname is not the container id", async () => {
		const mountinfo = `1 2 0:1 /docker/containers/${SELF_ID}/hostname /etc/hostname rw - ext4 /dev/sda1 rw`;
		const result = await discoverDocker({
			dockerHost: `unix://${socketPath}`,
			hostname: "custom-hostname",
			readMountinfo: () => mountinfo,
		});
		assert.equal(result.selfId, SELF_ID);
		assert.equal(result.items.length, 4);
	});

	it("falls back to matching our own IPs", async () => {
		const result = await discoverDocker({
			dockerHost: `unix://${socketPath}`,
			hostname: "custom-hostname",
			readMountinfo: () => "",
			interfaces: { eth0: [{ address: "172.18.0.2", family: "IPv4", internal: false }] },
		});
		assert.equal(result.selfId, SELF_ID);
		assert.ok(result.items.some((i) => i.host === "web"));
	});

	it("fails clearly when it can't find itself", async () => {
		await assert.rejects(
			discoverDocker({
				dockerHost: `unix://${socketPath}`,
				hostname: "nope",
				readMountinfo: () => "",
				interfaces: { eth0: [{ address: "10.9.9.9", family: "IPv4", internal: false }] },
			}),
			(err) => err.code === "ESELF",
		);
	});

	it("refuses paths outside the allowlist without sending anything", async () => {
		fake.requests.length = 0;
		const client = createDockerClient(`unix://${socketPath}`);
		await assert.rejects(client.get("/containers/create"), (err) => err.code === "EPATH");
		await assert.rejects(client.get("/containers/abc/exec"), (err) => err.code === "EPATH");
		assert.equal(fake.requests.length, 0);
	});

	it("reports a missing socket", async () => {
		await assert.rejects(discoverDocker({ dockerHost: `unix://${dir}/missing.sock` }), (err) => {
			assert.equal(err.code, "ENOENT");
			assert.match(describeDockerError(err), /does not exist/);
			return true;
		});
	});
});

describe("docker: client against a fake API over tcp", () => {
	const fake = createFakeDocker({
		handler: (_req, res, url) => {
			if (url.pathname === "/networks/big") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(`"${"x".repeat(3 * 1024 * 1024)}"`);
				return true;
			}
			if (url.pathname === "/networks/slow") {
				setTimeout(() => res.end("{}"), 2000);
				return true;
			}
			if (url.pathname === "/networks/denied") {
				res.writeHead(403);
				res.end("Forbidden");
				return true;
			}
			if (url.pathname === "/networks/broken") {
				res.writeHead(200);
				res.end("{not json");
				return true;
			}
			return false;
		},
	});
	let port;

	before(async () => {
		port = (await listen(fake.server, { host: "127.0.0.1", port: 0 })).port;
	});
	after(() => {
		fake.server.closeAllConnections?.();
		fake.server.close();
	});

	it("works over tcp://", async () => {
		const result = await discoverDocker({
			dockerHost: `tcp://127.0.0.1:${port}`,
			hostname: SELF_ID,
			interfaces: SELF_INTERFACES,
		});
		assert.equal(result.items.length, 4);
	});

	it("caps the response size", async () => {
		const client = createDockerClient(`tcp://127.0.0.1:${port}`);
		await assert.rejects(client.get("/networks/big"), (err) => err.code === "ETOOBIG");
	});

	it("times out", async () => {
		const client = createDockerClient(`tcp://127.0.0.1:${port}`, { timeoutMs: 200 });
		await assert.rejects(client.get("/networks/slow"), (err) => err.code === "ETIMEDOUT");
	});

	it("maps a socket-proxy 403 to a helpful message", async () => {
		const client = createDockerClient(`tcp://127.0.0.1:${port}`);
		await assert.rejects(client.get("/networks/denied"), (err) => {
			assert.equal(err.status, 403);
			assert.match(describeDockerError(err), /CONTAINERS=1/);
			return true;
		});
	});

	it("rejects invalid JSON", async () => {
		const client = createDockerClient(`tcp://127.0.0.1:${port}`);
		await assert.rejects(client.get("/networks/broken"), (err) => err.code === "EJSON");
	});

	it("reports a refused connection", async () => {
		const closed = http.createServer();
		const { port: freePort } = await listen(closed, { host: "127.0.0.1", port: 0 });
		await new Promise((resolve) => closed.close(resolve));
		await assert.rejects(discoverDocker({ dockerHost: `tcp://127.0.0.1:${freePort}` }), (err) => {
			assert.match(describeDockerError(err), /refused/);
			return true;
		});
	});
});
