import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProxyHostCandidate } from "../internal/nginx-config-renderer.js";
import { NGINX_RUNTIME_CAPABILITY, validateNginxCapability } from "../internal/nginx-runtime-capability.js";

const nginxBinary = process.env.NGINX_BINARY || "/usr/sbin/nginx";
const architecture = process.arch === "x64" ? "amd64" : process.arch;
const run = (args) => {
	const result = spawnSync(nginxBinary, args, { encoding: "utf8" });
	return { ...result, output: `${result.stdout || ""}${result.stderr || ""}`.trim() };
};

const version = run(["-v"]);
assert.equal(
	version.error,
	undefined,
	`Unable to execute ${nginxBinary}: ${version.error?.message || "unknown error"}`,
);
assert.equal(version.status, 0, version.output);
assert.match(version.output, /openresty\//i, `Expected the OpenResty runtime, received: ${version.output}`);
const actualVersion = /(?:openresty|nginx)\/(\d+(?:\.\d+)+)/i.exec(version.output)?.[1];
assert.ok(actualVersion, `Unable to parse nginx version from: ${version.output}`);
assert.equal(
	actualVersion,
	NGINX_RUNTIME_CAPABILITY.nginx_version,
	`Runtime nginx ${actualVersion} does not match capability ${NGINX_RUNTIME_CAPABILITY.nginx_version}`,
);
assert.ok(
	NGINX_RUNTIME_CAPABILITY.architectures.includes(architecture),
	`Runtime architecture ${architecture} is not declared by the capability profile`,
);
const { diagnostics } = validateNginxCapability(NGINX_RUNTIME_CAPABILITY);
assert.deepEqual(diagnostics, [], `Capability diagnostics: ${JSON.stringify(diagnostics)}`);

const candidate = await buildProxyHostCandidate({
	host: {
		id: 999,
		enabled: true,
		domain_names: ["semantic-runtime.invalid"],
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: 8080,
		access_list_id: 0,
		certificate_id: 0,
		ssl_forced: false,
		caching_enabled: false,
		block_exploits: false,
		allow_websocket_upgrade: false,
		http2_support: false,
		hsts_enabled: false,
		hsts_subdomains: false,
		trust_forwarded_proto: false,
		advanced_config: "",
		locations: [],
		nginx_config: { schema_version: 1, server: {} },
	},
});
assert.match(candidate.config, /\bproxy_pass_trailers off;/, "Explicit off directives must be rendered");

const directory = await mkdtemp(join(tmpdir(), "npm-nginx-runtime-"));
try {
	const logs = join(directory, "logs");
	const custom = join(directory, "custom");
	await mkdir(logs, { recursive: true });
	await mkdir(custom, { recursive: true });
	for (const name of ["client", "proxy", "fastcgi", "uwsgi", "scgi"])
		await mkdir(join(directory, name), { recursive: true });
	await writeFile(join(custom, "server_proxy.conf"), "# runtime validation include\n", "utf8");
	const normalizedPath = (value) => value.replaceAll("\\", "/");
	const isolatedConfig = candidate.config
		.replaceAll("/data/logs/", `${normalizedPath(logs)}/`)
		.replaceAll("/data/nginx/custom/", `${normalizedPath(custom)}/`);
	const masterPath = join(directory, "nginx.conf");
	const master = `user root;\nworker_processes 1;\npid ${normalizedPath(join(directory, "nginx.pid"))};\nerror_log stderr notice;\nevents { worker_connections 32; }\nhttp {\n  client_body_temp_path ${normalizedPath(join(directory, "client"))};\n  proxy_temp_path ${normalizedPath(join(directory, "proxy"))};\n  fastcgi_temp_path ${normalizedPath(join(directory, "fastcgi"))};\n  uwsgi_temp_path ${normalizedPath(join(directory, "uwsgi"))};\n  scgi_temp_path ${normalizedPath(join(directory, "scgi"))};\n  log_format proxy 'runtime';\n  log_format npm_proxy_metrics_v1 'runtime';\n  map $http_x_forwarded_proto $x_forwarded_proto { "http" "http"; "https" "https"; default $scheme; }\n  map $http_x_forwarded_scheme $x_forwarded_scheme { "http" "http"; "https" "https"; default $scheme; }\n${isolatedConfig}\n}\n`;
	await writeFile(masterPath, master, "utf8");
	const validation = run(["-t", "-e", "stderr", "-c", masterPath, "-p", `${normalizedPath(directory)}/`]);
	assert.equal(validation.status, 0, validation.output);
	console.log(
		`Validated explicit proxy runtime: architecture=${architecture}, nginx=${actualVersion}, config_hash=${candidate.configHash}`,
	);
} finally {
	await rm(directory, { recursive: true, force: true });
}
