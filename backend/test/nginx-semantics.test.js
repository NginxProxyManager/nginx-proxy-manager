import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import dns from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	chooseLocationMode,
	preflightLocation,
	prepareLocation,
	readLocationTemplate,
	renderLocation,
} from "../lib/nginx-locations.js";
import utils from "../lib/utils.js";
import { startEcho } from "./support/nginx-semantics-echo.js";

/**
 * Custom location semantics against a real nginx: the dynamic rendering (upstream host in a variable, resolved per
 * request) must answer exactly like the static rendering (literal upstream) and, for the cases whose behaviour did not
 * change on purpose, like the rendering used before dynamic locations existed. The configs come from the real
 * renderer (lib/nginx-locations.js, templates/_location.conf, templates/proxy_host.conf). Fixtures and the meaning
 * of each case: test/fixtures/nginx-semantics/README.md.
 *
 * Opt-in: it writes to /tmp/nginx-sem*, /data/access and /data/logs and starts nginx and an echo upstream, so it only
 * runs with NPM_TEST_NGINX=1, in a throwaway container of the nginx-full image on its own network, where the name
 * "echo" resolves to the container itself through Docker's resolver (127.0.0.11). From the repository root:
 *   docker network create npm-sem && docker run --rm --network npm-sem --network-alias echo -v "$PWD:/repo" -w /repo/backend -e NPM_TEST_NGINX=1 nginxproxymanager/nginx-full:certbot-node node --test test/nginx-semantics.test.js; docker network rm npm-sem
 * (backend dependencies installed). NPM_TEST_NGINX_INCLUDE overrides the conf.d/include folder (default: the
 * repository's docker/rootfs/etc/nginx/conf.d/include), NPM_TEST_NGINX_RESOLVER the resolver.
 */
const ENABLED = process.env.NPM_TEST_NGINX === "1";

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(BACKEND, "test/fixtures/nginx-semantics");
const INCLUDE_DIR =
	process.env.NPM_TEST_NGINX_INCLUDE || path.resolve(BACKEND, "../docker/rootfs/etc/nginx/conf.d/include");
const RESOLVER = process.env.NPM_TEST_NGINX_RESOLVER || "127.0.0.11";
// cases.json includes snippets from /tmp/nginx-sem/snip, so the folder is fixed
const WORK = "/tmp/nginx-sem";
const CONF = `${WORK}/nginx.conf`;

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
const cases = readJson("cases.json");
const { cachedHost: CACHED_HOST, skipLegacy: SKIP_LEGACY, requests } = readJson("requests.json");
const snippets = readJson("snippets.json");

// ---- config, as the backend renders it ----------------------------------------------------------------------------
//   :8001  legacy  hand written literal proxy_pass, the rendering before dynamic locations
//                  (only for cases without caching / access list, which changed on purpose)
//   :8002  static  real renderer, literal upstream          (cases without caching)
//   :8003  dynamic real renderer, upstream in a variable     (cases without caching)
//   :8012  static  cases with caching, in the full host template (templates/proxy_host.conf)
//   :8013  dynamic the same, dynamic rendering
// The cached cases need the whole host: proxy_host.conf includes the host-level asset location (assets.conf) before
// the custom locations. It proxies to the host's main upstream, echo:9001, and as a regex location it wins over
// every prefix custom location without a nested asset location of its own.

const ACCESS_LIST = {
	id: 4,
	items: [{ username: "alice" }],
	clients: [{ directive: "allow", address: "127.0.0.1" }],
	pass_auth: false,
	satisfy_any: false,
};

const hostFields = (c) => ({
	access_list_id: c.acl ? ACCESS_LIST.id : 0,
	access_list: c.acl ? ACCESS_LIST : null,
	certificate_id: 0,
	certificate: null,
	ssl_forced: false,
	caching_enabled: !!c.cache,
	block_exploits: false,
	allow_websocket_upgrade: true,
	http2_support: false,
	hsts_enabled: false,
	hsts_subdomains: false,
});

const location = (c) => ({
	path: c.path,
	forward_scheme: "http",
	forward_host: c.host || "echo",
	forward_port: 9000,
	forward_path: c.fp || "",
	advanced_config: c.adv || "",
});

const renderLocations = async (engine, template, mode, cached) => {
	let out = "";
	for (let i = 0; i < cases.length; i++) {
		const c = cases[i];
		if (!!c.cache !== cached) {
			continue;
		}
		const loc = Object.assign({}, hostFields(c), prepareLocation(location(c)));
		// what the backend checks before nginx is asked: a location it quarantines answers 503 here
		const problem = preflightLocation(loc);
		if (problem) {
			out += await renderLocation(engine, template, loc, { index: i, ...problem, mode: null, stub: true });
			continue;
		}
		// the mode the backend picks when the DNS check asks for `mode` (variable hosts, $uri readers)
		const chosen = chooseLocationMode(loc, { mode, status: "ok" }).mode;
		out += await renderLocation(engine, template, loc, { index: i, status: "ok", mode: chosen, stub: true });
	}
	return out;
};

const legacyLocations = () => {
	let out = "";
	for (const c of cases) {
		if (c.cache || c.acl) {
			continue;
		}
		const loc = prepareLocation(location(c));
		out += `  location ${c.path} {
    ${c.adv || ""}
    proxy_set_header Host $forward_host;
    proxy_set_header X-Forwarded-Scheme $scheme;
    proxy_set_header X-Forwarded-Proto  $scheme;
    proxy_set_header X-Forwarded-For    $remote_addr;
    proxy_set_header X-Real-IP          $remote_addr;
    proxy_pass       http://${loc.forward_host}:9000${loc.forward_path};
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $http_connection;
    proxy_http_version 1.1;
  }
`;
	}
	return out;
};

// The host as internal/nginx.js generateConfig() hands it to proxy_host.conf
const cachedHost = async (engine, template, mode, port) => {
	const hostTemplate = fs.readFileSync(path.join(BACKEND, "templates/proxy_host.conf"), "utf8");
	const text = await engine.parseAndRender(hostTemplate, {
		id: port,
		enabled: true,
		domain_names: [`sem-${mode}.test`],
		forward_scheme: "http",
		forward_host: "echo",
		forward_port: 9001,
		...hostFields({ cache: true }),
		advanced_config: "",
		use_default_location: true,
		ipv6: false,
		npm_location_dns: `# npm-location-dns: ${mode}`,
		locations: await renderLocations(engine, template, mode, true),
	});
	if (!/^\s*listen 80;$/m.test(text) || !/include conf\.d\/include\/assets\.conf;/.test(text)) {
		throw new Error("proxy_host.conf: no `listen 80;` or no host-level assets.conf");
	}
	return text.replace(/^(\s*)listen 80;$/m, `$1listen ${port};`);
};

const renderConfig = async () => {
	const engine = utils.getRenderEngine();
	const template = readLocationTemplate();
	const common = `  location = /auth { internal; proxy_pass http://echo:9000/auth; proxy_pass_request_body off; proxy_set_header Content-Length ""; }
`;
	return `user root;
daemon off;
error_log stderr warn;
pid /tmp/nginx-sem.pid;
events {}
http {
  access_log off;
  resolver ${RESOLVER} valid=10s;
  port_in_redirect off;
  # $forward_host, $forward_scheme and $x_forwarded_*, as docker/rootfs/etc/nginx/nginx.conf includes them
  include conf.d/include/proxy-variables.conf;
  # the format the host template logs with, conf.d/include/log-proxy.conf
  log_format proxy '[$time_local] $status $request_method $host "$request_uri" [Sent-to $server]';
  proxy_cache_path /tmp/nginx-sem-cache levels=1:2 keys_zone=public-cache:5m max_size=64m;
  server {
    listen 8001;
${common}${legacyLocations()}  }
  server {
    listen 8002;
${common}${await renderLocations(engine, template, "static", false)}  }
  server {
    listen 8003;
${common}${await renderLocations(engine, template, "dynamic", false)}  }
${await cachedHost(engine, template, "static", 8012)}
${await cachedHost(engine, template, "dynamic", 8013)}
}
`;
};

// ---- requests -----------------------------------------------------------------------------------------------------

/**
 * "<status> <Location and X-Sem-* headers> <body>" with the per server host name normalised. The echo upstream answers
 * with the Host header it got: it must be the Host the client sent (with its port, lower case as nginx's $host), also
 * for cached assets (the cache key has to include the port), otherwise the response is marked HOST-MISMATCH.
 */
const fetchFrom = (port, req) =>
	new Promise((resolve, reject) => {
		const host = `srv${port}${req.hostPort || ""}`;
		const sent = req.upperHost ? host.toUpperCase() : host;
		const headers = { Host: sent, Accept: "*/*" };
		if (req.auth) {
			headers.Authorization = `Basic ${Buffer.from(req.auth).toString("base64")}`;
		}
		if (req.header) {
			const at = req.header.indexOf(":");
			headers[req.header.slice(0, at)] = req.header.slice(at + 1).trim();
		}
		const request = http.request({ host: "127.0.0.1", port, path: req.path, headers, agent: false }, (res) => {
			let body = "";
			res.setEncoding("utf8");
			res.on("data", (chunk) => {
				body += chunk;
			});
			res.on("end", () => {
				body = body.replace(/\n+$/, "");
				let out = `${res.statusCode}`;
				const got = body.match(/"host":"[^"]*"/);
				if (got && got[0] !== `"host":"${host}"`) {
					out += ` HOST-MISMATCH(sent ${sent})`;
				}
				let shown = "";
				for (let i = 0; i < res.rawHeaders.length; i += 2) {
					if (/^(location|x-sem-[a-z-]+)$/i.test(res.rawHeaders[i])) {
						shown += `${res.rawHeaders[i]}: ${res.rawHeaders[i + 1]} `;
					}
				}
				resolve(`${out} ${shown} ${body}`.replace(/srv80[0-9]{2}/g, "srv"));
			});
			res.on("error", reject);
		});
		request.on("error", reject);
		request.end();
	});

const startsWithAny = (prefixes, p) => prefixes.some((prefix) => p.startsWith(`/${prefix}/`));

// the request as one line: path|user:password|:port|expected|header ("^" before the port: upper case host name)
const describeRequest = (r) =>
	[r.path, r.auth || "", `${r.upperHost ? "^" : ""}${r.hostPort || ""}`, r.expect || "", r.header || ""]
		.join("|")
		.replace(/\|+$/, "");

/**
 * Compares one request and returns the number of comparisons made and the difference, if any. Cases with "Cache
 * Assets" are served by the full host (:8012 / :8013), the others by :8002 / :8003. Neither those nor the access
 * list case are compared with the legacy rendering.
 */
const compare = async (req) => {
	const cached = startsWithAny(CACHED_HOST, req.path);
	const staticOut = await fetchFrom(cached ? 8012 : 8002, req);
	const dynamicOut = await fetchFrom(cached ? 8013 : 8003, req);
	const both = `   static:  ${staticOut}\n   dynamic: ${dynamicOut}`;
	const expect = req.expect || "";
	// a custom location's request (asset or not) must not end up at the host's main upstream, unless expected
	if (`${staticOut}${dynamicOut}`.includes('"upstream":"main"') && !expect.includes('"upstream":"main"')) {
		return { comparisons: 1, diff: `main upstream\n${both}` };
	}
	if (`${staticOut}${dynamicOut}`.includes("HOST-MISMATCH")) {
		return { comparisons: 1, diff: `forwarded Host\n${both}` };
	}
	if (expect && (!dynamicOut.includes(expect) || !staticOut.includes(expect))) {
		return { comparisons: 1, diff: `expected ${expect}\n${both}` };
	}
	if (staticOut !== dynamicOut) {
		return { comparisons: 1, diff: `static/dynamic\n${both}` };
	}
	if (cached || startsWithAny(SKIP_LEGACY, req.path)) {
		return { comparisons: 1, diff: null };
	}
	const legacyOut = await fetchFrom(8001, req);
	if (legacyOut !== dynamicOut || legacyOut.includes("HOST-MISMATCH")) {
		return { comparisons: 2, diff: `legacy/dynamic\n   legacy:  ${legacyOut}\n   dynamic: ${dynamicOut}` };
	}
	return { comparisons: 2, diff: null };
};

// ---- setup --------------------------------------------------------------------------------------------------------

const waitForPort = async (port, nginxLog) => {
	for (let i = 0; i < 100; i++) {
		const open = await new Promise((resolve) => {
			const socket = net.connect(port, "127.0.0.1");
			socket.once("connect", () => {
				socket.destroy();
				resolve(true);
			});
			socket.once("error", () => resolve(false));
		});
		if (open) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`nginx does not listen on ${port}:\n${nginxLog()}`);
};

const prepare = async () => {
	try {
		await dns.lookup("echo");
	} catch {
		throw new Error(
			'the name "echo" must resolve to this container: run it on its own Docker network with --network-alias echo',
		);
	}
	if (!fs.existsSync(path.join(INCLUDE_DIR, "assets.conf"))) {
		throw new Error(`no assets.conf in ${INCLUDE_DIR}: set NPM_TEST_NGINX_INCLUDE to NPM's conf.d/include folder`);
	}
	for (const dir of [WORK, "/tmp/nginx-sem-cache", "/tmp/nginx-sem-store"]) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
	for (const dir of [
		`${WORK}/conf.d`,
		`${WORK}/snip`,
		"/var/log/nginx",
		"/var/cache/nginx",
		"/data/access",
		"/data/logs",
		"/tmp/nginx-sem-cache",
		"/tmp/nginx-sem-store",
	]) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync("/data/access/4", "alice:{PLAIN}secret\n");
	// `include conf.d/include/...` of the host template is relative to the config file
	fs.symlinkSync(INCLUDE_DIR, `${WORK}/conf.d/include`);
	// snippets the advanced configs of cases.json include
	for (const [name, lines] of Object.entries(snippets)) {
		fs.writeFileSync(`${WORK}/snip/${name}`, `${lines.join("\n")}\n`);
	}
	fs.writeFileSync(CONF, await renderConfig());
	try {
		execFileSync("nginx", ["-t", "-c", CONF], { stdio: "pipe" });
	} catch (err) {
		throw new Error(`nginx -t failed (config: ${CONF}):\n${err.stderr}`);
	}
};

describe("Custom location semantics with nginx", { skip: ENABLED ? false : "set NPM_TEST_NGINX=1 to run" }, () => {
	let nginx;
	let stopEcho;
	let nginxLog = "";
	let comparisons = 0;
	const diffs = [];

	before(async () => {
		await prepare();
		stopEcho = await startEcho();
		nginx = spawn("nginx", ["-c", CONF], { stdio: ["ignore", "ignore", "pipe"] });
		nginx.stderr.on("data", (chunk) => {
			nginxLog += chunk;
		});
		for (const port of [8001, 8002, 8003, 8012, 8013]) {
			await waitForPort(port, () => nginxLog);
		}
	});

	after(async () => {
		nginx?.kill();
		await stopEcho?.();
	});

	for (const req of requests) {
		const line = describeRequest(req);
		it(line, async () => {
			const result = await compare(req);
			comparisons += result.comparisons;
			if (result.diff) {
				diffs.push(`DIFF  ${line}: ${result.diff}`);
				assert.fail(`${line}: ${result.diff}`);
			}
		});
	}

	it("answers every request the same way", (t) => {
		t.diagnostic(`COMPARISONS=${comparisons} DIFFS=${diffs.length}`);
		assert.equal(diffs.length, 0, `${diffs.length} of ${comparisons} comparisons differ:\n${diffs.join("\n")}`);
	});
});
