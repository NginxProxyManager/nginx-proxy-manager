// Renders the custom locations of cases.json with the REAL backend renderer
// (backend/lib/nginx-locations.js + backend/templates/_location.conf) into one nginx config:
//
//   :8001  legacy  hand written literal proxy_pass, the rendering before dynamic locations
//                  (only for cases without caching / access list, which changed on purpose)
//   :8002  static  real renderer, literal upstream          (cases without caching)
//   :8003  dynamic real renderer, upstream in a variable     (cases without caching)
//   :8012  static  cases with caching, in the full host template (backend/templates/proxy_host.conf)
//   :8013  dynamic the same, dynamic rendering
//
// The cached cases need the whole host: proxy_host.conf includes the host-level asset location
// (conf.d/include/assets.conf through _assets.conf) in the server block before the custom locations. It proxies
// to the host's main upstream, here echo:9001 (answers with "upstream":"main"), and as a regex location it wins
// over every prefix custom location that has no nested asset location of its own. `include conf.d/...` is read
// relative to the config file, run.sh links conf.d/include to docker/rootfs/etc/nginx/conf.d/include.
//
// Usage: node gen.mjs <backend dir> > nginx.conf
import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "node:fs";

const backendDir = path.resolve(process.argv[2] || "../../backend");
const here = path.dirname(new URL(import.meta.url).pathname);
const cases = JSON.parse(fs.readFileSync(path.join(here, "cases.json"), "utf8"));

const { chooseLocationMode, preflightLocation, prepareLocation, readLocationTemplate, renderLocation } = await import(
	pathToFileURL(path.join(backendDir, "lib/nginx-locations.js")).href
);
const { default: utils } = await import(pathToFileURL(path.join(backendDir, "lib/utils.js")).href);

const engine = utils.getRenderEngine();
const template = readLocationTemplate();

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

const render = async (mode, cached) => {
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

const legacy = () => {
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
const cachedHost = async (mode, port) => {
	const hostTemplate = fs.readFileSync(path.join(backendDir, "templates/proxy_host.conf"), "utf8");
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
		locations: await render(mode, true),
	});
	if (!/^\s*listen 80;$/m.test(text) || !/include conf\.d\/include\/assets\.conf;/.test(text)) {
		throw new Error("proxy_host.conf: no `listen 80;` or no host-level assets.conf");
	}
	return text.replace(/^(\s*)listen 80;$/m, `$1listen ${port};`);
};

const common = `  location = /auth { internal; proxy_pass http://echo:9000/auth; proxy_pass_request_body off; proxy_set_header Content-Length ""; }
`;

process.stdout.write(`user root;
daemon off;
error_log /dev/stderr warn;
pid /tmp/nginx-sem.pid;
events {}
http {
  access_log off;
  resolver 127.0.0.11 valid=10s;
  port_in_redirect off;
  # as in docker/rootfs/etc/nginx/nginx.conf: nginx's normalised $host plus the client's port when the Host
  # header names the same host
  map "$host|$http_host" $forward_host {
    "~*^(?<fwd_name>[^|]+)\\|\\k<fwd_name>(?<fwd_port>:[0-9]+)$" "$host$fwd_port";
    default $host;
  }
  # as in docker/rootfs/etc/nginx/nginx.conf, used by conf.d/include/proxy.conf
  map $host $forward_scheme {
    default http;
  }
  map $http_x_forwarded_proto $x_forwarded_proto {
    "http" "http";
    "https" "https";
    default $scheme;
  }
  map $http_x_forwarded_scheme $x_forwarded_scheme {
    "http" "http";
    "https" "https";
    default $scheme;
  }
  # the format the host template logs with, conf.d/include/log-proxy.conf
  log_format proxy '[$time_local] $status $request_method $host "$request_uri" [Sent-to $server]';
  proxy_cache_path /tmp/nginx-sem-cache levels=1:2 keys_zone=public-cache:5m max_size=64m;
  server {
    listen 8001;
${common}${legacy()}  }
  server {
    listen 8002;
${common}${await render("static", false)}  }
  server {
    listen 8003;
${common}${await render("dynamic", false)}  }
${await cachedHost("static", 8012)}
${await cachedHost("dynamic", 8013)}
}
`);
