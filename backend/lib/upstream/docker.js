import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import { isValidHost } from "./util.js";

/**
 * Read-only Docker Engine API client used for upstream discovery.
 *
 * - plain node:http (never an HTTP(S)_PROXY agent: the socket or socket-proxy is local)
 * - GET only, against a hard-coded allowlist of paths
 * - 3s timeout and 2MB response cap
 * - only names, ports, state, network, ip and the parsed npm.* labels leave this module; never env,
 *   mounts, cmd or other labels
 */

const REQUEST_TIMEOUT_MS = 3000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const ID_PATTERN = "[A-Za-z0-9][A-Za-z0-9_.-]{0,127}";
const ALLOWED_PATHS = [
	/^\/version$/,
	/^\/containers\/json(?:\?[A-Za-z0-9%=&_.-]*)?$/,
	new RegExp(`^/containers/${ID_PATTERN}/json$`),
	new RegExp(`^/networks/${ID_PATTERN}$`),
];

class DockerApiError extends Error {
	/**
	 * @param {string} message  English text (logs, API `message`)
	 * @param {string} [code]   errno-like code (EINVAL, ESTATUS, ...)
	 * @param {number} [status] HTTP status of a Docker API answer
	 * @param {object} [params] values for a translated text in the UI, see dockerErrorInfo()
	 */
	constructor(message, code, status, params) {
		super(message);
		this.name = "DockerApiError";
		this.code = code || null;
		this.status = status || null;
		this.params = params || null;
	}
}

/**
 * DOCKER_HOST (or a socket path from it) as it may be shown or logged: without user info (`tcp://user:pass@host`
 * and `user:pass@host` give `tcp://***@host` and `***@host`), its query and fragment, which can hold credentials.
 * Everything up to the last `@` counts as user info, so a password with `/`, `?`, `#` or `@` in it is cut as
 * well; the query and fragment are cut after that. Discovery users who aren't admins see the errors that name it.
 *
 * @param   {string} value
 * @returns {string}
 */
const safeDockerHost = (value) => {
	const text = `${value ?? ""}`;
	const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(text)?.[0] || "";
	let rest = text.slice(scheme.length);
	const at = rest.lastIndexOf("@");
	if (at >= 0) {
		rest = `***${rest.slice(at)}`;
	}
	return scheme + rest.replace(/[?#].*$/s, "");
};

/**
 * The same for any text, eg. an error message, that can contain DOCKER_HOST or another URL with credentials:
 * user info up to the last `@` of the URL (as far as the next white space or quote), its query and fragment
 *
 * @param   {string} text
 * @returns {string}
 */
const withoutUrlCredentials = (text) =>
	`${text ?? ""}`
		.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s"']*@/gi, "$1***@")
		.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s"'?#]*)[?#][^\s"']*/gi, "$1");

/**
 * Parses DOCKER_HOST into node:http request options. Errors never contain credentials, see safeDockerHost().
 *
 * @param   {string} dockerHost  unix:///path, tcp://host:port or http://host:port
 * @returns {{socketPath?: string, host?: string, port?: number}}
 * @throws  {DockerApiError}
 */
const parseDockerHost = (dockerHost) => {
	const raw = `${dockerHost ?? ""}`.trim();
	const shown = safeDockerHost(raw);
	if (raw.startsWith("unix://")) {
		const socketPath = raw.slice("unix://".length);
		if (!socketPath.startsWith("/")) {
			throw new DockerApiError(`DOCKER_HOST "${shown}" must be an absolute unix socket path.`, "EINVAL", null, {
				value: shown,
				problem: "unix_path",
			});
		}
		return { socketPath };
	}
	if (raw.startsWith("/")) {
		return { socketPath: raw };
	}
	// no user info (`tcp://user@host`): the Docker API has no login, and `[^:/@]` keeps it out of the host name
	const match = /^(?:tcp|http):\/\/(\[[^\]]+\]|[^:/@]+)(?::(\d{1,5}))?\/?$/.exec(raw);
	if (match) {
		const port = match[2] ? Number.parseInt(match[2], 10) : 2375;
		if (port < 1 || port > 65535) {
			throw new DockerApiError(`DOCKER_HOST "${shown}" has an invalid port.`, "EINVAL", null, {
				value: shown,
				problem: "port",
			});
		}
		return { host: match[1].replace(/^\[|\]$/g, ""), port };
	}
	throw new DockerApiError(
		`DOCKER_HOST "${shown}" is not supported. Use unix:///var/run/docker.sock or tcp://host:2375 (TLS is not supported).`,
		"EINVAL",
		null,
		{ value: shown, problem: "unsupported" },
	);
};

/**
 * @param   {string} path
 * @returns {boolean}
 */
const isAllowedPath = (path) => ALLOWED_PATHS.some((re) => re.test(path));

/**
 * Creates a minimal client bound to one DOCKER_HOST
 *
 * @param   {string} dockerHost
 * @param   {object} [opts]
 * @param   {number} [opts.timeoutMs]
 * @param   {number} [opts.maxBytes]
 * @returns {{get: function(string): Promise<any>, target: object}}
 */
const createDockerClient = (dockerHost, opts = {}) => {
	const target = parseDockerHost(dockerHost);
	const timeoutMs = opts.timeoutMs || REQUEST_TIMEOUT_MS;
	const maxBytes = opts.maxBytes || MAX_RESPONSE_BYTES;

	const get = (path) =>
		new Promise((resolve, reject) => {
			if (!isAllowedPath(path)) {
				reject(new DockerApiError(`Docker API path not allowed: ${path.split("?")[0]}`, "EPATH"));
				return;
			}

			let settled = false;
			const done = (fn, value) => {
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					fn(value);
				}
			};

			const req = http.request(
				{
					...target,
					method: "GET",
					path,
					agent: false,
					headers: { Accept: "application/json", Host: "docker" },
				},
				(res) => {
					const chunks = [];
					let size = 0;
					res.on("data", (chunk) => {
						size += chunk.length;
						if (size > maxBytes) {
							req.destroy();
							done(reject, new DockerApiError("Docker API response is too large.", "ETOOBIG"));
							return;
						}
						chunks.push(chunk);
					});
					res.on("end", () => {
						if (settled) {
							return;
						}
						if (res.statusCode !== 200) {
							done(
								reject,
								new DockerApiError(
									`Docker API answered ${res.statusCode} for ${path.split("?")[0]}`,
									"ESTATUS",
									res.statusCode,
									{ status: res.statusCode, path: path.split("?")[0] },
								),
							);
							return;
						}
						try {
							done(resolve, JSON.parse(Buffer.concat(chunks).toString("utf8")));
						} catch (_) {
							done(reject, new DockerApiError("Docker API returned invalid JSON.", "EJSON"));
						}
					});
					res.on("error", (err) => done(reject, new DockerApiError(err.message, err.code)));
				},
			);

			const timer = setTimeout(() => {
				req.destroy();
				done(
					reject,
					new DockerApiError(
						`Docker API did not answer within ${REQUEST_TIMEOUT_MS / 1000} seconds.`,
						"ETIMEDOUT",
						null,
						{ seconds: REQUEST_TIMEOUT_MS / 1000 },
					),
				);
			}, timeoutMs);

			req.on("error", (err) => done(reject, new DockerApiError(err.message, err.code)));
			req.end();
		});

	return { get, target };
};

/**
 * Finds the 64-hex container id in /proc/self/mountinfo (the /etc/hostname bind mount lives in
 * /var/lib/docker/containers/<id>/). Works on cgroup v2 where /proc/self/cgroup is just "0::/".
 *
 * @param   {string} content
 * @returns {string|null}
 */
const parseMountinfoContainerId = (content) => {
	const match = /\/containers\/([0-9a-f]{64})\//.exec(`${content ?? ""}`);
	return match ? match[1] : null;
};

/**
 * @param   {object} [interfaces]  os.networkInterfaces() output
 * @returns {string[]}  non-internal addresses
 */
const ownAddresses = (interfaces = os.networkInterfaces()) =>
	Object.values(interfaces || {})
		.flat()
		.filter((addr) => addr && !addr.internal)
		.map((addr) => addr.address);

const safeName = (name) => `${name ?? ""}`.replace(/^\//, "");

/**
 * Container names usable as an upstream host. Legacy link aliases ("/web/db") contain a slash
 * and are not resolvable names, so they are dropped.
 *
 * @param   {Array} names  Names from /containers/json
 * @returns {string[]}
 */
const usableNames = (names) =>
	(Array.isArray(names) ? names : []).map(safeName).filter((name) => !name.includes("/") && isValidHost(name));

/**
 * Whether an inspected container is really us: at least one of its network addresses must be one
 * of ours. A container without any address (host network) cannot be disproved and is accepted.
 *
 * @param   {object}   container  /containers/{id}/json response
 * @param   {string[]} mine       ownAddresses()
 * @returns {boolean}
 */
const looksLikeSelf = (container, mine) => {
	const ips = Object.values(container?.NetworkSettings?.Networks || {})
		.map((n) => n?.IPAddress)
		.filter(Boolean);
	if (!ips.length) {
		return true;
	}
	const set = new Set(mine);
	return ips.some((ip) => set.has(ip));
};

const TRUE_RE = /^(1|true|yes|on)$/i;
const FALSE_RE = /^(0|false|no|off)$/i;
const MAX_LABEL_DOMAINS = 100;
const MAX_IGNORED_DOMAINS = 10;
// Letters (also IDN), digits, dots, hyphens, underscores, plus one leading "*." wildcard: a subset of what the
// proxy host domain names field and the domain_names schema accept.
const DOMAIN_CHARS_RE = /^[\p{L}\p{N}\p{M}._-]+$/u;

/**
 * Boolean label: true/false, or null when missing or not a recognised boolean
 *
 * @param   {any} value
 * @returns {boolean|null}
 */
const labelBool = (value) => {
	const raw = `${value ?? ""}`.trim();
	if (TRUE_RE.test(raw)) {
		return true;
	}
	if (FALSE_RE.test(raw)) {
		return false;
	}
	return null;
};

// A domain name without wildcard (see isValidLabelDomain)
const isPlainLabelDomain = (domain) =>
	domain.length >= 3 &&
	domain.length <= 253 &&
	DOMAIN_CHARS_RE.test(domain) &&
	!domain.startsWith(".") &&
	!domain.endsWith(".") &&
	!domain.includes("..") &&
	domain.split(".").every((part) => part.length <= 63 && !part.startsWith("-") && !part.endsWith("-"));

/**
 * Whether a domain from a label would be accepted by the proxy host domain names field (and is a sane host
 * name). A wildcard is allowed only as a leading "*." in front of at least two labels ("*.example.com", not
 * "*.com"), the form nginx and DNS challenge certificates both understand.
 *
 * @param   {string} domain  lower-cased and trimmed
 * @returns {boolean}
 */
const isValidLabelDomain = (domain) => {
	if (typeof domain !== "string") {
		return false;
	}
	if (domain.startsWith("*.")) {
		const rest = domain.slice(2);
		return rest.includes(".") && domain.length <= 253 && isPlainLabelDomain(rest);
	}
	return isPlainLabelDomain(domain);
};

/**
 * Splits the npm.domain label (comma and/or white space separated domain names) into the usable domain
 * names (duplicates removed, at most 100) and the entries that were dropped because the domain names field
 * would refuse them (at most 10, each cut to 100 characters), so the UI can say why a name is missing.
 *
 * @param   {any} value
 * @returns {{domains: string[], ignored: string[]}}
 */
const splitLabelDomains = (value) => {
	const domains = [];
	const ignored = [];
	if (typeof value !== "string") {
		return { domains, ignored };
	}
	for (const raw of value.split(/[\s,]+/)) {
		if (domains.length >= MAX_LABEL_DOMAINS) {
			break;
		}
		const domain = raw.trim().toLowerCase();
		if (!domain) {
			continue;
		}
		if (isValidLabelDomain(domain)) {
			if (!domains.includes(domain)) {
				domains.push(domain);
			}
			continue;
		}
		const shown = domain.slice(0, 100);
		if (ignored.length < MAX_IGNORED_DOMAINS && !ignored.includes(shown)) {
			ignored.push(shown);
		}
	}
	return { domains, ignored };
};

/**
 * Parses the npm.domain label: the usable domain names only (see splitLabelDomains).
 *
 * @param   {any} value
 * @returns {string[]}
 */
const parseLabelDomains = (value) => splitLabelDomains(value).domains;

/**
 * Reads the hints from npm.* labels. No other label ever leaves this module.
 * Invalid values are ignored (null / empty).
 *
 * @param   {object} labels
 * @returns {{hide: boolean, port: number|null, scheme: string|null, domains: string[], ignored_domains: string[],
 *            websocket: boolean|null, block_exploits: boolean|null, caching: boolean|null, http2: boolean|null}}
 */
const parseNpmLabels = (labels) => {
	const l = labels && typeof labels === "object" ? labels : {};
	const rawPort = `${l["npm.port"] ?? ""}`.trim();
	const port = /^\d{1,5}$/.test(rawPort) ? Number.parseInt(rawPort, 10) : 0;
	const scheme = `${l["npm.scheme"] ?? ""}`.trim().toLowerCase();
	const { domains, ignored } = splitLabelDomains(l["npm.domain"]);
	return {
		hide: labelBool(l["npm.hide"]) === true,
		port: port >= 1 && port <= 65535 ? port : null,
		scheme: scheme === "http" || scheme === "https" ? scheme : null,
		domains,
		ignored_domains: ignored,
		websocket: labelBool(l["npm.websocket"]),
		block_exploits: labelBool(l["npm.block_exploits"]),
		caching: labelBool(l["npm.caching"]),
		http2: labelBool(l["npm.http2"]),
	};
};

/**
 * Turns the /containers/json list into candidate items.
 *
 * @param   {Array}    containers   /containers/json response
 * @param   {object}   ctx
 * @param   {string[]} ctx.networks Networks NPM is attached to (names)
 * @param   {string}   [ctx.selfId] NPM's own container id (skipped)
 * @returns {Array<object>}
 */
const containersToCandidates = (containers, { networks, selfId }) => {
	const items = [];
	const shared = new Set(networks || []);

	for (const container of Array.isArray(containers) ? containers : []) {
		if (!container || typeof container !== "object") {
			continue;
		}
		const id = `${container.Id ?? ""}`;
		if (selfId && id && (id === selfId || id.startsWith(selfId) || selfId.startsWith(id))) {
			continue;
		}

		const labels = container.Labels && typeof container.Labels === "object" ? container.Labels : {};
		const hints = parseNpmLabels(labels);
		if (hints.hide) {
			continue;
		}

		const names = usableNames(container.Names);
		if (!names.length) {
			continue;
		}

		const ports = [
			...new Set(
				(Array.isArray(container.Ports) ? container.Ports : [])
					.filter((p) => p && `${p.Type ?? "tcp"}`.toLowerCase() === "tcp")
					.map((p) => Number.parseInt(p.PrivatePort, 10))
					.filter((p) => p >= 1 && p <= 65535),
			),
		];
		if (hints.port && !ports.includes(hints.port)) {
			ports.push(hints.port);
		}
		ports.sort((a, b) => a - b);

		let network = null;
		let ip = null;
		const containerNetworks = container.NetworkSettings?.Networks || {};
		for (const [name, info] of Object.entries(containerNetworks)) {
			if (!shared.size || shared.has(name)) {
				network = name;
				ip = info?.IPAddress || null;
				break;
			}
		}

		const hintPort = hints.port || (ports.length === 1 ? ports[0] : null);
		const hintScheme = hints.scheme || (hintPort === 443 || hintPort === 8443 ? "https" : null);
		const state = typeof container.State === "string" ? container.State : null;

		const base = {
			source: "docker",
			ports,
			hint_port: hintPort,
			hint_scheme: hintScheme,
			network,
			state,
			ip,
			used_by: 0,
		};

		// Proxy host fields from the labels, filled in when the container (or its compose service alias) is picked
		const suggestion = {
			domain_names: hints.domains,
			forward_scheme: hintScheme || "http",
			forward_host: names[0],
			forward_port: hintPort,
			allow_websocket_upgrade: hints.websocket === true,
			block_exploits: hints.block_exploits === true,
			caching_enabled: hints.caching === true,
			http2_support: hints.http2 === true,
			ignored_domains: hints.ignored_domains,
			existing_host_id: null,
			existing_host_type: null,
		};

		items.push({ ...base, host: names[0], kind: "container", owner: null, suggestion });

		const service = `${labels["com.docker.compose.service"] ?? ""}`.trim();
		if (service && service !== names[0] && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(service) && isValidHost(service)) {
			items.push({
				...base,
				host: service,
				kind: "compose_service",
				owner: names[0],
				// the same container: picking either name fills in the same labels
				suggestion: {
					...suggestion,
					domain_names: [...suggestion.domain_names],
					ignored_domains: [...suggestion.ignored_domains],
					forward_host: service,
				},
			});
		}
	}

	return items;
};

/**
 * Names and addresses of the containers labelled npm.hide=true. Other providers (DNS discovery) can't read labels
 * and would suggest these containers again, so their results are filtered with this. Only names and IPs leave
 * this module, never labels.
 *
 * @param   {Array}    containers   /containers/json response
 * @param   {object}   [ctx]
 * @param   {string}   [ctx.selfId] NPM's own container id (skipped)
 * @returns {{hosts: Set<string>, ips: Set<string>}} hosts in lower case
 */
const collectHiddenTargets = (containers, { selfId } = {}) => {
	const hosts = new Set();
	const ips = new Set();
	for (const container of Array.isArray(containers) ? containers : []) {
		if (!container || typeof container !== "object") {
			continue;
		}
		const id = `${container.Id ?? ""}`;
		if (selfId && id && (id === selfId || id.startsWith(selfId) || selfId.startsWith(id))) {
			continue;
		}
		const labels = container.Labels && typeof container.Labels === "object" ? container.Labels : {};
		if (!parseNpmLabels(labels).hide) {
			continue;
		}
		for (const name of usableNames(container.Names)) {
			hosts.add(name.toLowerCase());
		}
		const service = `${labels["com.docker.compose.service"] ?? ""}`.trim();
		if (service && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(service) && isValidHost(service)) {
			hosts.add(service.toLowerCase());
		}
		// every network: DNS discovery sweeps all of NPM's subnets
		for (const info of Object.values(container.NetworkSettings?.Networks || {})) {
			if (typeof info?.IPAddress === "string" && info.IPAddress !== "") {
				ips.add(info.IPAddress);
			}
		}
	}
	return { hosts, ips };
};

/**
 * Discovers containers that share a network with NPM.
 *
 * @param   {object}   [opts]
 * @param   {string}   opts.dockerHost
 * @param   {string}   [opts.hostname]     defaults to os.hostname()
 * @param   {function} [opts.readMountinfo]
 * @param   {object}   [opts.interfaces]   defaults to os.networkInterfaces()
 * @param   {object}   [opts.client]       pre-built client (tests)
 * @returns {Promise<{items: Array, hidden: {hosts: Set<string>, ips: Set<string>}, networks: string[],
 *          selfId: string|null}>} hidden: the containers labelled npm.hide=true, see collectHiddenTargets()
 */
const discoverDocker = async (opts = {}) => {
	const client = opts.client || createDockerClient(opts.dockerHost);

	if (client.target?.socketPath) {
		try {
			fs.statSync(client.target.socketPath);
		} catch (_) {
			const shown = safeDockerHost(client.target.socketPath);
			throw new DockerApiError(
				`Docker socket ${shown} does not exist. Mount it, or point DOCKER_HOST at a docker-socket-proxy.`,
				"ENOENT",
				null,
				{ path: shown },
			);
		}
	}

	await client.get("/version");

	const inspect = async (id) => {
		if (!id || !new RegExp(`^${ID_PATTERN}$`).test(id)) {
			return null;
		}
		try {
			return await client.get(`/containers/${id}/json`);
		} catch (err) {
			if (err.status === 404) {
				return null;
			}
			throw err;
		}
	};

	// 1. Who am I? The hostname is usually the short container id, but users can set it to anything
	// (even another container's name), so a hostname match must also share one of our addresses.
	const mine = ownAddresses(opts.interfaces);
	let self = await inspect(opts.hostname ?? os.hostname());
	if (self && !looksLikeSelf(self, mine)) {
		self = null;
	}
	if (!self) {
		// 2. The container id from our own mount table
		let mountinfo = "";
		try {
			mountinfo = opts.readMountinfo ? opts.readMountinfo() : fs.readFileSync("/proc/self/mountinfo", "utf8");
		} catch (_) {
			// ignore
		}
		self = await inspect(parseMountinfoContainerId(mountinfo));
	}

	let selfId = self?.Id || null;
	let networks = Object.keys(self?.NetworkSettings?.Networks || {});

	if (!self) {
		// 3. Fallback: match our own IPs against the running containers
		const mineSet = new Set(mine);
		const all = await client.get("/containers/json");
		const match = (Array.isArray(all) ? all : []).find((c) =>
			Object.values(c?.NetworkSettings?.Networks || {}).some((n) => n?.IPAddress && mineSet.has(n.IPAddress)),
		);
		if (match) {
			selfId = match.Id || null;
			networks = Object.keys(match.NetworkSettings?.Networks || {});
		}
	}

	if (!networks.length) {
		throw new DockerApiError(
			"Could not find Nginx Proxy Manager's own container through the Docker API, so its networks are unknown.",
			"ESELF",
		);
	}

	// "host" and "none" networks have no peers we could resolve by name
	const usable = networks.filter((n) => n !== "host" && n !== "none");
	if (!usable.length) {
		return { items: [], hidden: { hosts: new Set(), ips: new Set() }, networks, selfId };
	}

	const filters = encodeURIComponent(JSON.stringify({ network: usable }));
	const containers = await client.get(`/containers/json?filters=${filters}`);
	return {
		items: containersToCandidates(containers, { networks: usable, selfId }),
		hidden: collectHiddenTargets(containers, { selfId }),
		networks: usable,
		selfId,
	};
};

/**
 * Human readable reason why the Docker provider failed
 *
 * @param   {Error} err
 * @returns {string}
 */
const describeDockerError = (err) => {
	if (!err) {
		return "Docker discovery failed.";
	}
	if (err.code === "EACCES") {
		return "Permission denied on the Docker socket. The backend runs as PUID/PGID without supplementary groups; use a docker-socket-proxy (DOCKER_HOST=tcp://...) instead.";
	}
	if (err.code === "ECONNREFUSED") {
		return "Connection to the Docker API was refused. Check DOCKER_HOST and that the socket proxy is running.";
	}
	if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") {
		return "The DOCKER_HOST host name could not be resolved.";
	}
	if (err.status === 403) {
		return "The Docker API denied the request. If you use a docker-socket-proxy, enable CONTAINERS=1 and NETWORKS=1.";
	}
	if (err instanceof DockerApiError) {
		return withoutUrlCredentials(err.message);
	}
	return withoutUrlCredentials(`Docker discovery failed: ${err.message || err.code || "unknown error"}`);
};

/**
 * Why the Docker provider failed, as a language neutral code and the values a translated text needs. The UI
 * shows `upstream.docker-error.<code>`; `detail` is the raw (untranslated) error text where that helps.
 *
 * Codes: socket_missing {path}, permission_denied, connection_refused, host_not_found, api_denied, timeout
 * {seconds}, invalid_docker_host {value, problem: unix_path|port|unsupported}, bad_status {status, path},
 * bad_response, self_not_found, failed {detail}
 *
 * @param   {Error} err
 * @returns {{code: string, params: object}}
 */
const dockerErrorInfo = (err) => {
	const p = err?.params || {};
	if (!err) {
		return { code: "failed", params: {} };
	}
	if (err.code === "ENOENT" && p.path) {
		return { code: "socket_missing", params: { path: safeDockerHost(p.path) } };
	}
	if (err.code === "EACCES") {
		return { code: "permission_denied", params: {} };
	}
	if (err.code === "ECONNREFUSED") {
		return { code: "connection_refused", params: {} };
	}
	if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") {
		return { code: "host_not_found", params: {} };
	}
	if (err.status === 403) {
		return { code: "api_denied", params: {} };
	}
	if (err.code === "ETIMEDOUT") {
		return { code: "timeout", params: { seconds: p.seconds ?? REQUEST_TIMEOUT_MS / 1000 } };
	}
	if (err.code === "EINVAL" && p.problem) {
		return { code: "invalid_docker_host", params: { value: safeDockerHost(p.value), problem: p.problem } };
	}
	if (err.code === "ESTATUS") {
		return { code: "bad_status", params: { status: err.status ?? p.status ?? 0, path: `${p.path ?? ""}` } };
	}
	if (err.code === "ETOOBIG" || err.code === "EJSON") {
		return { code: "bad_response", params: {} };
	}
	if (err.code === "ESELF") {
		return { code: "self_not_found", params: {} };
	}
	return { code: "failed", params: { detail: withoutUrlCredentials(err.message || err.code || "") } };
};

export {
	ALLOWED_PATHS,
	collectHiddenTargets,
	containersToCandidates,
	createDockerClient,
	DockerApiError,
	describeDockerError,
	discoverDocker,
	dockerErrorInfo,
	isAllowedPath,
	isValidLabelDomain,
	looksLikeSelf,
	ownAddresses,
	parseDockerHost,
	safeDockerHost,
	withoutUrlCredentials,
	parseLabelDomains,
	splitLabelDomains,
	parseMountinfoContainerId,
	parseNpmLabels,
	usableNames,
};
