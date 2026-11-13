import dns from "node:dns";
import net from "node:net";
import {
	createLimiter,
	hasCustomResolver,
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
	// getaddrinfo runs on libuv's threadpool and can't be cancelled: the lookup keeps its limiter slot until it
	// settles, so slow lookups can't pile up beyond the cap. Only the caller stops waiting at the timeout.
	const settled = dnsLimit(() => {
		const started = Date.now();
		return Promise.resolve()
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
						DNS_TIMEOUT.has(err?.code) || (err?.code === "EAI_AGAIN" && Date.now() - started >= SLOW_EAI_AGAIN_MS),
					error: err?.code || "ERROR",
				}),
			);
	});
	return withTimeout(settled, timeoutMs, () => ({ ok: false, addresses: [], timeout: true, error: "ETIMEOUT" }));
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
/**
 * @param   {string}   address
 * @param   {number}   port
 * @param   {number}   [timeoutMs]
 * @param   {Function} [createSocket]  () => net.Socket-like, injectable for the tests
 */
const tcpConnect = (address, port, timeoutMs = TCP_TIMEOUT_MS, createSocket = () => new net.Socket()) =>
	tcpLimit(
		() =>
			new Promise((resolve) => {
				const started = process.hrtime.bigint();
				let settled = false;
				const socket = createSocket();

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
	no_resolver: (t, r) =>
		`${describeHost(t.host, t.port)} is reachable${typeof r.ms === "number" ? ` (${formatMs(r.ms)})` : ""}, but nginx resolves this upstream per request and has no DNS resolver (DISABLE_RESOLVER is set and neither the custom config nor the advanced configuration sets one): requests fail. Use an IP address, enable the resolver or set a resolver in the advanced configuration.`,
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
			? `"${t.host}" contains an nginx variable. nginx resolves it per request, it can't be checked here.`
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
		lookups: null,
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
 * Connects to the addresses of one lookup method in turn until one answers. Connections are shared through
 * `cache` (address -> promise), so an address both methods return is probed once.
 *
 * @param   {string[]} addresses
 * @param   {number}   port
 * @param   {Map}      cache
 * @param   {number}   [timeoutMs]
 * @returns {Promise<object>}  the tcpConnect() result of the last attempt
 */
const connectAny = async (addresses, port, cache, timeoutMs) => {
	let tcp = null;
	for (const address of orderAddresses(addresses, []).slice(0, MAX_TCP_ATTEMPTS)) {
		if (!cache.has(address)) {
			cache.set(address, tcpConnect(address, port, timeoutMs));
		}
		tcp = await cache.get(address);
		// A timeout already used the whole budget; don't multiply it
		if (tcp.ok || tcp.code === "tcp_timeout") {
			break;
		}
	}
	return tcp;
};

/**
 * The outcome of one lookup method: its DNS answer and whether one of its addresses accepted a connection.
 *
 * @param   {DnsView}     view
 * @param   {object|null} tcp   connectAny() result, null when the view found no address
 * @returns {{ok: boolean, code: string, addresses: string[], ms: number|null}}
 */
const lookupOutcome = (view, tcp) => {
	if (!view.addresses.length) {
		return { ok: false, code: view.timeout ? "dns_timeout" : "dns_not_found", addresses: [], ms: null };
	}
	return { ok: !!tcp?.ok, code: tcp?.code || "tcp_unreachable", addresses: view.addresses, ms: tcp?.ms ?? null };
};

/**
 * The top level code / ok of a check from the outcome of each lookup method.
 *
 * - `needsResolver === true`: nginx resolves the target per request through its `resolver` only (a proxy_pass with
 *   a variable). Only the resolver's addresses count; one that only resolves through /etc/hosts or a search
 *   domain is a resolver_mismatch and not ok. Without any resolver (DISABLE_RESOLVER, and none in the custom
 *   http or server_proxy config or in the host's or location's advanced configuration) nginx can't resolve a name
 *   at all: no_resolver, not ok. With a resolver only there (not probed) the system view stands in.
 * - `needsResolver === false`: a literal proxy_pass, resolved by the system at config load. Only the system's
 *   addresses count; a name nginx's resolver doesn't know is a resolver_mismatch that stays ok.
 * - otherwise (the mode is not known): every method that found the name has to reach it.
 *
 * @param   {{system: object, resolver: object|null}} lookups  lookupOutcome() of each method
 * @param   {boolean|undefined} needsResolver
 * @param   {boolean} [customResolver]  a resolver from the custom config or the advanced configuration serves the
 *          target, see hasCustomResolver() and hostSetsResolver()
 * @returns {{ok: boolean, code: string, ms: number|null, required?: boolean}}
 */
const combineLookups = ({ system, resolver }, needsResolver, customResolver = false) => {
	const found = (outcome) => !!outcome?.addresses.length;
	const dnsFailure = (outcomes) => ({
		ok: false,
		code: outcomes.every((o) => o.code === "dns_timeout") ? "dns_timeout" : "dns_not_found",
		ms: null,
	});
	const views = [system, resolver].filter(Boolean);

	if (needsResolver === true && !resolver && !customResolver) {
		// nginx answers "no resolver defined" for every request of this upstream
		return found(system) ? { ok: false, code: "no_resolver", ms: system.ms ?? null } : dnsFailure([system]);
	}

	if (needsResolver === true && resolver) {
		if (found(resolver)) {
			return { ok: resolver.ok, code: resolver.code, ms: resolver.ms };
		}
		if (!found(system)) {
			return dnsFailure(views);
		}
		if (!system.ok) {
			return { ok: false, code: system.code, ms: null };
		}
		return { ok: false, code: "resolver_mismatch", ms: system.ms, required: true };
	}

	if (needsResolver === false || !resolver) {
		if (!found(system)) {
			// A static upstream nginx can't resolve at load: the resolver's answer doesn't help it
			return needsResolver === false ? dnsFailure([system]) : dnsFailure(views);
		}
		if (!system.ok) {
			return { ok: false, code: system.code, ms: null };
		}
		return { ok: true, code: resolver && !found(resolver) ? "resolver_mismatch" : "ok", ms: system.ms };
	}

	// Mode not known: every method that found the name must reach it
	const answered = views.filter(found);
	if (!answered.length) {
		return dnsFailure(views);
	}
	const failed = answered.find((o) => !o.ok);
	if (failed) {
		return { ok: false, code: failed.code, ms: null };
	}
	const ms = (found(resolver) ? resolver.ms : system.ms) ?? null;
	return { ok: true, code: found(system) && !found(resolver) ? "resolver_mismatch" : "ok", ms };
};

/**
 * Checks one target: host syntax, DNS (system + nginx resolver view) and a bare TCP connect to the addresses of
 * each lookup method. The reachability of each method is kept apart (`lookups`), so a target is not ok because
 * the other method's address answers, see combineLookups().
 *
 * @param   {{host: string, port: number, scheme?: string, resolver?: boolean}} rawTarget  host may contain "/path";
 *          resolver: whether nginx resolves the target per request (unknown when not given)
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
	if (net.isIP(literal)) {
		const tcp = await tcpConnect(literal, target.port, opts.tcpTimeoutMs);
		return makeResult(target, { addresses: [literal], ms: tcp.ms, ok: tcp.ok, code: tcp.code });
	}

	const resolvers = typeof opts.resolvers === "undefined" ? readNginxResolvers() : opts.resolvers;
	const needsResolver = typeof rawTarget.resolver === "boolean" ? rawTarget.resolver : undefined;
	const [system, viaResolver] = await Promise.all([
		systemLookup(target.host, { lookup: opts.lookup }),
		resolverLookup(target.host, resolvers, { resolver: opts.resolver }),
	]);

	const cache = new Map();
	const [systemTcp, resolverTcp] = await Promise.all([
		system.addresses.length ? connectAny(system.addresses, target.port, cache, opts.tcpTimeoutMs) : null,
		viaResolver?.addresses.length ? connectAny(viaResolver.addresses, target.port, cache, opts.tcpTimeoutMs) : null,
	]);
	const lookups = {
		system: lookupOutcome(system, systemTcp),
		resolver: viaResolver ? lookupOutcome(viaResolver, resolverTcp) : null,
	};
	return resultFromLookups(
		target,
		{
			addresses: orderAddresses(viaResolver?.addresses || [], system.addresses),
			system_ok: system.ok,
			resolver_ok: viaResolver ? viaResolver.ok : null,
			lookups,
		},
		needsResolver,
		needsResolver === true && !viaResolver ? (opts.customResolver ?? hasCustomResolver()) : false,
	);
};

/**
 * @param   {object}  target   {host, port, scheme}
 * @param   {object}  fields   addresses, system_ok, resolver_ok and the internal lookups
 * @param   {boolean|undefined} needsResolver
 * @param   {boolean} [customResolver]  see combineLookups()
 * @returns {object}  the result in API shape, `lookups` with the outcome of each method (resolver: null when
 *          nginx has no resolver)
 */
const resultFromLookups = (target, { lookups, ...fields }, needsResolver, customResolver = false) => {
	const combined = combineLookups(lookups, needsResolver, customResolver);
	const result = makeResult(target, {
		...fields,
		ok: combined.ok,
		code: combined.code,
		ms: combined.ms,
		lookups,
	});
	if (combined.required) {
		result.message = MESSAGES.resolver_required(target, result);
	}
	return result;
};

/**
 * A check result as it applies to a target whose lookup method is known: a proxy_pass with a variable (the main
 * target of every proxy host, a custom location in dynamic mode or with a variable forward path) is resolved by
 * nginx's `resolver` per request, never through /etc/hosts or search domains; a literal one (a static custom
 * location, a stream) by the system at config load. Only the reachability through that method counts, see
 * combineLookups(). A resolver_mismatch keeps its code when it is not ok, so clients show it as a warning.
 *
 * @param   {object}  result          from checkTarget()
 * @param   {object}  target          {host, port}
 * @param   {boolean} needsResolver   nginx resolves the target per request
 * @param   {boolean} [customResolver]  see combineLookups(); read from the custom http and server_proxy config
 *          when not given
 * @returns {object}  the result for that method (a copy)
 */
const forResolverTarget = (result, target, needsResolver, customResolver) => {
	if (result?.lookups?.system) {
		const { host, port, scheme, addresses, system_ok, resolver_ok, lookups } = result;
		const fresh = resultFromLookups(
			{ host: splitHostPath(target?.host ?? host).host, port: target?.port ?? port, scheme },
			{ addresses, system_ok, resolver_ok, lookups },
			!!needsResolver,
			needsResolver && !lookups.resolver ? (customResolver ?? hasCustomResolver()) : false,
		);
		return { ...fresh, host };
	}
	// No lookup (IP literal, not probed): only a resolver_mismatch can depend on the method
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
	combineLookups,
	forResolverTarget,
	formatMs,
	MESSAGES,
	resolverLookup,
	systemLookup,
	targetKey,
	tcpConnect,
};
