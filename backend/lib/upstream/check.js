import dns from "node:dns";
import net from "node:net";
import {
	createLimiter,
	isValidHost,
	isVariableHost,
	readNginxResolvers,
	splitHostPath,
	unbracket,
	withTimeout,
} from "./util.js";

const TCP_TIMEOUT_MS = 3000;
const SYSTEM_LOOKUP_TIMEOUT_MS = 2000;
const RESOLVER_TIMEOUT_MS = 1000;
const MAX_TCP_ATTEMPTS = 3;

// Errors that mean "no answer" rather than "no such name"
const DNS_TIMEOUT = new Set(["ETIMEOUT", "ETIMEDOUT", "ECONNREFUSED", "ECANCELLED"]);
// getaddrinfo's EAI_AGAIN is ambiguous: Docker's embedded DNS forwards unknown single-label names to the
// host resolver, which answers SERVFAIL within milliseconds and glibc reports EAI_AGAIN. Only a slow
// EAI_AGAIN is a real timeout.
const SLOW_EAI_AGAIN_MS = 1000;

// Global caps so concurrent requests can't open an unbounded number of sockets / DNS queries
const tcpLimit = createLimiter(32);
const dnsLimit = createLimiter(16);

/**
 * @typedef  {object} DnsView
 * @property {boolean}  ok
 * @property {string[]} addresses
 * @property {boolean}  timeout
 * @property {string|null} error
 */

/**
 * System view: what getaddrinfo (and therefore a literal proxy_pass at config load) sees.
 * Honours /etc/hosts and resolv.conf search domains.
 *
 * @param   {string} host
 * @param   {object} [opts]
 * @returns {Promise<DnsView>}
 */
const systemLookup = (host, opts = {}) => {
	const lookup = opts.lookup || dns.promises.lookup;
	const timeoutMs = opts.timeoutMs || SYSTEM_LOOKUP_TIMEOUT_MS;
	return dnsLimit(() => {
		const started = Date.now();
		return withTimeout(
			Promise.resolve()
				.then(() => lookup(host, { all: true, verbatim: false }))
				.then(
					(list) => {
						const addresses = [...new Set((list || []).map((entry) => entry.address))];
						return { ok: addresses.length > 0, addresses, timeout: false, error: null };
					},
					(err) => ({
						ok: false,
						addresses: [],
						timeout:
							DNS_TIMEOUT.has(err?.code) ||
							(err?.code === "EAI_AGAIN" && Date.now() - started >= SLOW_EAI_AGAIN_MS),
						error: err?.code || "ERROR",
					}),
				),
			timeoutMs,
			() => ({ ok: false, addresses: [], timeout: true, error: "ETIMEOUT" }),
		);
	});
};

/**
 * Resolver view: what nginx's `resolver` (used by variable proxy_pass at request time) sees.
 * Ignores /etc/hosts and search domains.
 *
 * @param   {string}   host
 * @param   {{servers: string[], ipv6: boolean}|null} resolvers
 * @param   {object}   [opts]
 * @returns {Promise<DnsView|null>}  null when nginx has no resolver configured
 */
const resolverLookup = async (host, resolvers, opts = {}) => {
	if (!resolvers?.servers?.length) {
		return null;
	}
	const timeoutMs = opts.timeoutMs || RESOLVER_TIMEOUT_MS;
	const resolver = opts.resolver || new dns.promises.Resolver({ timeout: timeoutMs, tries: 1 });
	if (!opts.resolver) {
		resolver.setServers(resolvers.servers);
	}

	const query = (fn) =>
		dnsLimit(() =>
			withTimeout(
				fn.call(resolver, host).then(
					(addresses) => ({ addresses: addresses || [], error: null }),
					(err) => ({ addresses: [], error: err?.code || "ERROR" }),
				),
				timeoutMs + 500,
				() => ({ addresses: [], error: "ETIMEOUT" }),
			),
		);

	const results = await Promise.all([
		query(resolver.resolve4),
		resolvers.ipv6 ? query(resolver.resolve6) : Promise.resolve({ addresses: [], error: "ENODATA" }),
	]);

	if (!opts.resolver && typeof resolver.cancel === "function") {
		resolver.cancel();
	}

	const addresses = [...new Set(results.flatMap((r) => r.addresses))];
	const timeout = addresses.length === 0 && results.some((r) => r.error && DNS_TIMEOUT.has(r.error));
	return {
		ok: addresses.length > 0,
		addresses,
		timeout,
		error: addresses.length ? null : results.find((r) => r.error)?.error || null,
	};
};

/**
 * Opens a TCP connection and closes it straight away. Nothing is read or written.
 *
 * @param   {string} address
 * @param   {number} port
 * @param   {number} [timeoutMs]
 * @returns {Promise<{ok: boolean, code: string, ms: number|null, error: string|null}>}
 */
const tcpConnect = (address, port, timeoutMs = TCP_TIMEOUT_MS) =>
	tcpLimit(
		() =>
			new Promise((resolve) => {
				const started = process.hrtime.bigint();
				let settled = false;
				const socket = new net.Socket();

				const finish = (result) => {
					if (settled) {
						return;
					}
					settled = true;
					clearTimeout(timer);
					socket.removeAllListeners();
					socket.on("error", () => {});
					socket.destroy();
					resolve(result);
				};

				const timer = setTimeout(() => {
					finish({ ok: false, code: "tcp_timeout", ms: null, error: "ETIMEDOUT" });
				}, timeoutMs);

				socket.once("connect", () => {
					const ms = Number(process.hrtime.bigint() - started) / 1e6;
					finish({ ok: true, code: "ok", ms: Math.round(ms * 10) / 10, error: null });
				});

				socket.once("error", (err) => {
					let code = "tcp_unreachable";
					if (err?.code === "ECONNREFUSED") {
						code = "tcp_refused";
					} else if (err?.code === "ETIMEDOUT") {
						code = "tcp_timeout";
					}
					finish({ ok: false, code, ms: null, error: err?.code || "ERROR" });
				});

				socket.connect({ host: address, port, family: net.isIPv6(address) ? 6 : 4 });
			}),
	);

const describeHost = (host, port) => (port ? `${host}:${port}` : host);

/** Whole milliseconds, "<1 ms" below one (a container on the same host answers in a fraction of one) */
const formatMs = (ms) => (ms < 1 ? "<1 ms" : `${Math.round(ms)} ms`);

const MESSAGES = {
	ok: (t, r) => `${describeHost(t.host, t.port)} is reachable${typeof r.ms === "number" ? ` (${formatMs(r.ms)})` : ""}.`,
	invalid_host: (t) =>
		t.host
			? `"${t.host}" is not a valid host name or IP address.`
			: "No host given. Enter a host name or IP address.",
	dns_not_found: (t) =>
		`Host "${t.host}" could not be found. Check the spelling, and that the container is running and on the same Docker network as Nginx Proxy Manager.`,
	dns_timeout: (t) => `Looking up "${t.host}" timed out. The DNS server did not answer in time.`,
	resolver_mismatch: (t, r) =>
		`${describeHost(t.host, t.port)} is reachable${typeof r.ms === "number" ? ` (${formatMs(r.ms)})` : ""}, but "${t.host}" only resolves through /etc/hosts or a resolv.conf search domain, not through nginx's DNS resolver. It works only with a static (load-time) upstream.`,
	// resolver_mismatch of a target nginx resolves per request, see forResolverTarget()
	resolver_required: (t, r) =>
		`${describeHost(t.host, t.port)} is reachable${typeof r.ms === "number" ? ` (${formatMs(r.ms)})` : ""}, but "${t.host}" only resolves through /etc/hosts or a resolv.conf search domain. nginx resolves this upstream per request through its DNS resolver, which doesn't find it: requests fail. Use a name the resolver finds (eg. the container name on a shared Docker network) or an IP address.`,
	tcp_refused: (t) =>
		`Connection to ${describeHost(t.host, t.port)} was refused. The host exists, but nothing is listening on port ${t.port}.`,
	tcp_timeout: (t) =>
		`Connection to ${describeHost(t.host, t.port)} timed out. A firewall may be dropping traffic, or the host is down.`,
	tcp_unreachable: (t) =>
		`${describeHost(t.host, t.port)} is unreachable from Nginx Proxy Manager (no route to host).`,
	disabled: (t) =>
		isVariableHost(t.host)
			? `"${t.host}" is an nginx variable. nginx resolves it per request, it can't be checked here.`
			: "Upstream checks are disabled on this server (NPM_UPSTREAM_CHECK=false).",
};

/**
 * Builds the result object in the API shape
 */
const makeResult = (target, fields) => {
	const result = {
		host: target.host,
		port: target.port,
		scheme: target.scheme ?? null,
		ok: false,
		code: "ok",
		message: "",
		addresses: [],
		resolver_ok: null,
		system_ok: null,
		ms: null,
		...fields,
	};
	result.message = MESSAGES[result.code] ? MESSAGES[result.code](target, result) : result.code;
	return result;
};

/**
 * Orders addresses for connecting: the resolver view first (that is what nginx uses at request
 * time), IPv4 before IPv6.
 *
 * @param   {string[]} preferred
 * @param   {string[]} other
 * @returns {string[]}
 */
const orderAddresses = (preferred, other) => {
	const all = [...new Set([...preferred, ...other])];
	return [...all.filter((a) => net.isIPv4(a)), ...all.filter((a) => !net.isIPv4(a))];
};

/**
 * Checks one target: host syntax, DNS (system + nginx resolver view) and a bare TCP connect.
 *
 * @param   {{host: string, port: number, scheme?: string}} rawTarget  host may contain "/path"
 * @param   {object}   [opts]
 * @param   {boolean}  [opts.enabled]     false -> "disabled" result without touching the network
 * @param   {object}   [opts.resolvers]   nginx resolvers ({servers, ipv6}); defaults to resolvers.conf
 * @param   {function} [opts.lookup]      dns.promises.lookup replacement (tests)
 * @param   {object}   [opts.resolver]    dns.promises.Resolver replacement (tests)
 * @param   {number}   [opts.tcpTimeoutMs]
 * @returns {Promise<object>}
 */
const checkTarget = async (rawTarget, opts = {}) => {
	const { host: rawHost } = splitHostPath(rawTarget.host);
	const target = {
		host: rawHost,
		port: Number.parseInt(rawTarget.port, 10),
		scheme: rawTarget.scheme ?? null,
	};

	// A variable upstream is not checked: neutral "disabled" result, not an invalid host
	if (opts.enabled === false || isVariableHost(target.host)) {
		return makeResult(target, { code: "disabled" });
	}

	if (!isValidHost(target.host) || !(target.port >= 1 && target.port <= 65535)) {
		return makeResult(target, { code: "invalid_host" });
	}

	const literal = unbracket(target.host);
	let addresses;
	let systemOk = null;
	let resolverOk = null;
	let mismatch = false;

	if (net.isIP(literal)) {
		addresses = [literal];
	} else {
		const resolvers = typeof opts.resolvers === "undefined" ? readNginxResolvers() : opts.resolvers;
		const [system, viaResolver] = await Promise.all([
			systemLookup(target.host, { lookup: opts.lookup }),
			resolverLookup(target.host, resolvers, { resolver: opts.resolver }),
		]);

		systemOk = system.ok;
		resolverOk = viaResolver ? viaResolver.ok : null;
		addresses = orderAddresses(viaResolver?.addresses || [], system.addresses);

		if (!addresses.length) {
			// Any definitive "no such name" answer wins; it's only a timeout when no view gave an answer
			const timedOut = system.timeout && (viaResolver ? viaResolver.timeout : true);
			return makeResult(target, {
				code: timedOut ? "dns_timeout" : "dns_not_found",
				system_ok: systemOk,
				resolver_ok: resolverOk,
			});
		}
		mismatch = systemOk === true && resolverOk === false;
	}

	let tcp = null;
	for (const address of addresses.slice(0, MAX_TCP_ATTEMPTS)) {
		tcp = await tcpConnect(address, target.port, opts.tcpTimeoutMs);
		// A timeout already used the whole budget; don't multiply it
		if (tcp.ok || tcp.code === "tcp_timeout") {
			break;
		}
	}

	const common = { addresses, system_ok: systemOk, resolver_ok: resolverOk, ms: tcp.ms };
	if (!tcp.ok) {
		return makeResult(target, { ...common, code: tcp.code });
	}
	return makeResult(target, { ...common, ok: true, code: mismatch ? "resolver_mismatch" : "ok" });
};

/**
 * A check result as it applies to a target nginx resolves per request: a proxy_pass with a variable, which is the
 * main target of every proxy host and a custom location in dynamic mode. Such a proxy_pass only uses nginx's
 * `resolver`, never /etc/hosts or search domains, so a resolver_mismatch (reachable, but only through those) fails
 * at request time: the result is not ok. The code stays resolver_mismatch, so clients show it as a warning.
 * A static (load-time) upstream is resolved like the check's system lookup, its resolver_mismatch stays ok.
 *
 * @param   {object}  result          from checkTarget()
 * @param   {object}  target          {host, port}
 * @param   {boolean} needsResolver   nginx resolves the target per request
 * @returns {object}  the result, or a copy marked not ok
 */
const forResolverTarget = (result, target, needsResolver) => {
	if (!needsResolver || result?.code !== "resolver_mismatch") {
		return result;
	}
	return { ...result, ok: false, message: MESSAGES.resolver_required(target, result) };
};

/**
 * Key used to dedupe identical targets
 *
 * @param   {{host: string, port: number, scheme?: string}} target
 * @returns {string}
 */
const targetKey = (target) => {
	const { host } = splitHostPath(target.host);
	return `${host.toLowerCase()}|${target.port}|${target.scheme ?? ""}`;
};

/**
 * Checks several targets; identical ones are only probed once. Results keep the input order.
 *
 * @param   {Array} targets
 * @param   {object} [opts]  see checkTarget
 * @returns {Promise<Array>}
 */
const checkTargets = async (targets, opts = {}) => {
	const resolvers = typeof opts.resolvers === "undefined" ? readNginxResolvers() : opts.resolvers;
	const pending = new Map();
	for (const target of targets) {
		const key = targetKey(target);
		if (!pending.has(key)) {
			pending.set(key, checkTarget(target, { ...opts, resolvers }));
		}
	}
	// Echo the host exactly as given (trimmed, path included) so clients can match results to inputs
	return Promise.all(
		targets.map(async (target) => ({
			...(await pending.get(targetKey(target))),
			host: `${target.host ?? ""}`.trim(),
		})),
	);
};

export {
	checkTarget,
	checkTargets,
	forResolverTarget,
	formatMs,
	MESSAGES,
	resolverLookup,
	systemLookup,
	targetKey,
	tcpConnect,
};
