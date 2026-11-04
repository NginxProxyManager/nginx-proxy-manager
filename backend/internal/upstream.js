import { buildHistoryCandidates, mergeCandidates } from "../lib/upstream/candidates.js";
import { checkTarget, checkTargets } from "../lib/upstream/check.js";
import {
	getDockerHost,
	getHealthInterval,
	isDnsDiscoveryEnabled,
	isDockerDiscoveryEnabled,
	isUpstreamCheckEnabled,
} from "../lib/upstream/config.js";
import { DnsDiscoveryUnavailable, discoverDns } from "../lib/upstream/dns-discovery.js";
import { describeDockerError, discoverDocker } from "../lib/upstream/docker.js";
import { TooManyRequestsError } from "../lib/upstream/errors.js";
import { HealthMonitor, visibilityFilter } from "../lib/upstream/health.js";
import { createRateLimiter } from "../lib/upstream/rate-limit.js";
import errs from "../lib/error.js";
import { debug, global as logger } from "../logger.js";
import proxyHostModel from "../models/proxy_host.js";
import streamModel from "../models/stream.js";
import internalProxyHost from "./proxy-host.js";
import internalStream from "./stream.js";

const CACHE_TTL_MS = 30 * 1000;
const MAX_TARGETS = 20;

const checkLimiter = createRateLimiter({ limit: 60, windowMs: 60 * 1000 });
const refreshLimiter = createRateLimiter({ limit: 6, windowMs: 60 * 1000 });

/** @type {{at: number, value: object}|null} */
let discoveryCache = null;
/** @type {Promise<object>|null} */
let discoveryInFlight = null;

const DOCKER_DISABLED_MESSAGE =
	"Docker discovery is disabled. Set NPM_DOCKER_DISCOVERY=true and DOCKER_HOST (a docker-socket-proxy is recommended) to list containers.";
const DNS_DISABLED_MESSAGE = "DNS discovery is disabled (NPM_DNS_DISCOVERY=false).";

/**
 * Runs the docker + dns providers (not user specific, so cached globally)
 *
 * @returns {Promise<{providers: object, items: Array}>}
 */
const runDiscoveryProviders = async () => {
	const dockerPromise = (async () => {
		if (!isDockerDiscoveryEnabled()) {
			return { status: { status: "disabled", message: DOCKER_DISABLED_MESSAGE }, items: [] };
		}
		try {
			const result = await discoverDocker({ dockerHost: getDockerHost() });
			return { status: { status: "ok", message: null }, items: result.items };
		} catch (err) {
			debug(logger, `Upstream docker discovery failed: ${err.message}`);
			return { status: { status: "unavailable", message: describeDockerError(err) }, items: [] };
		}
	})();

	const dnsPromise = (async () => {
		if (!isDnsDiscoveryEnabled()) {
			return { status: { status: "disabled", message: DNS_DISABLED_MESSAGE }, items: [] };
		}
		try {
			const result = await discoverDns();
			return {
				status: {
					status: "ok",
					message: result.truncated
						? "The network scan stopped early; some containers may be missing."
						: null,
				},
				items: result.items,
			};
		} catch (err) {
			if (!(err instanceof DnsDiscoveryUnavailable)) {
				debug(logger, `Upstream dns discovery failed: ${err.message}`);
			}
			return {
				status: {
					status: "unavailable",
					message: err instanceof DnsDiscoveryUnavailable ? err.message : "DNS discovery failed.",
				},
				items: [],
			};
		}
	})();

	const [docker, dnsResult] = await Promise.all([dockerPromise, dnsPromise]);
	return {
		providers: { docker: docker.status, dns: dnsResult.status },
		items: [...docker.items, ...dnsResult.items],
	};
};

/**
 * Cached (30s), single-flight discovery
 *
 * @param   {boolean} refresh
 * @returns {Promise<{providers: object, items: Array}>}
 */
const getDiscovery = (refresh) => {
	if (!refresh && discoveryCache && Date.now() - discoveryCache.at < CACHE_TTL_MS) {
		return Promise.resolve(discoveryCache.value);
	}
	if (!discoveryInFlight) {
		discoveryInFlight = runDiscoveryProviders()
			.then((value) => {
				discoveryCache = { at: Date.now(), value };
				return value;
			})
			.finally(() => {
				discoveryInFlight = null;
			});
	}
	return discoveryInFlight;
};

/**
 * Forward hosts this user has already used. Visibility rules of the list endpoints apply.
 *
 * @param   {Access} access
 * @returns {Promise<{status: object, items: Array}>}
 */
const getHistory = async (access) => {
	const load = async (permission, fn) => {
		try {
			// Only asking: a user without the permission is normal here and must not log an error
			await access.can(permission, undefined, { quiet: true });
			return { rows: await fn(), denied: false };
		} catch (err) {
			if (err instanceof errs.PermissionError) {
				return { rows: [], denied: true };
			}
			throw err;
		}
	};

	try {
		const [proxyHosts, streams] = await Promise.all([
			load("proxy_hosts:list", () => internalProxyHost.getAll(access)),
			load("streams:list", () => internalStream.getAll(access)),
		]);
		return {
			status: { status: "ok", message: null },
			items: buildHistoryCandidates({ proxyHosts: proxyHosts.rows, streams: streams.rows }),
		};
	} catch (err) {
		debug(logger, `Upstream history failed: ${err.message}`);
		return { status: { status: "unavailable", message: "Could not read existing hosts." }, items: [] };
	}
};

const rateKey = (access) => `${access.token.getUserId(0)}`;

const internalUpstream = {
	/**
	 * GET /upstreams/candidates
	 *
	 * @param   {Access}  access
	 * @param   {object}  [data]
	 * @param   {boolean} [data.refresh]
	 * @returns {Promise<object>}
	 */
	getCandidates: async (access, data = {}) => {
		await access.can("upstreams:discover");

		const refresh = data.refresh === true;
		if (refresh) {
			const limit = refreshLimiter.consume(rateKey(access));
			if (!limit.ok) {
				throw new TooManyRequestsError(
					`Too many discovery refreshes. Try again in ${limit.retryAfter} seconds.`,
					limit.retryAfter,
				);
			}
		}

		const [discovery, history] = await Promise.all([getDiscovery(refresh), getHistory(access)]);
		return {
			providers: { ...discovery.providers, history: history.status },
			items: mergeCandidates([discovery.items, history.items]),
			generated_at: new Date().toISOString(),
		};
	},

	/**
	 * POST /upstreams/check
	 *
	 * @param   {Access}  access
	 * @param   {object}  data
	 * @param   {Array}   data.targets
	 * @returns {Promise<{results: Array}>}
	 */
	check: async (access, data) => {
		await access.can("upstreams:discover");

		const targets = Array.isArray(data?.targets) ? data.targets.slice(0, MAX_TARGETS) : [];
		if (!targets.length) {
			throw new errs.ValidationError("At least one target is required");
		}

		const enabled = isUpstreamCheckEnabled();
		if (enabled) {
			const limit = checkLimiter.consume(rateKey(access), targets.length);
			if (!limit.ok) {
				throw new TooManyRequestsError(
					`Too many upstream checks. Try again in ${limit.retryAfter} seconds.`,
					limit.retryAfter,
				);
			}
		}

		const results = await checkTargets(targets, { enabled });
		debug(logger, `Upstream check: ${results.map((r) => `${r.host}:${r.port}=${r.code}`).join(", ")}`);
		return { results };
	},

	/**
	 * GET /upstreams/health
	 *
	 * @param   {Access} access
	 * @returns {Promise<object>}
	 */
	getHealth: async (access) => {
		const visibility = async (permission, allowedIds) => {
			try {
				// Polled by every open hosts page: a missing permission is expected, don't log it as an error
				const accessData = await access.can(permission, undefined, { quiet: true });
				return visibilityFilter(accessData, access.token.getUserId(1), allowedIds);
			} catch (err) {
				if (err instanceof errs.PermissionError) {
					return null;
				}
				throw err;
			}
		};

		// Proxy hosts can also be shared with a user explicitly, as in the proxy host list
		const permissions = access.getPermissions ? access.getPermissions() : {};
		const allowedProxyHostIds = permissions?.meta?.proxy_host_ids || permissions?.meta?.proxyHostIds || [];
		const [proxyFilter, streamFilter] = await Promise.all([
			visibility("proxy_hosts:list", allowedProxyHostIds),
			visibility("streams:list"),
		]);
		if (!proxyFilter && !streamFilter) {
			throw new errs.PermissionError("Permission Denied");
		}
		return healthMonitor.snapshot({ proxy_host: proxyFilter, stream: streamFilter });
	},

	/**
	 * Starts the background health monitor (called from index.js after listen)
	 */
	initHealthMonitor: () => {
		try {
			healthMonitor.start();
		} catch (err) {
			logger.error(`Upstream health monitor could not start: ${err.message}`);
		}
	},

	stopHealthMonitor: () => {
		healthMonitor.stop();
	},
};

const healthMonitor = new HealthMonitor({
	getInterval: getHealthInterval,
	isEnabled: isUpstreamCheckEnabled,
	logger,
	loadRows: async () => {
		const [proxyHosts, streams] = await Promise.all([
			proxyHostModel
				.query()
				.select("id", "owner_user_id", "enabled", "forward_host", "forward_port", "forward_scheme", "locations")
				.where("is_deleted", 0)
				.andWhere("enabled", 1),
			streamModel
				.query()
				.select("id", "owner_user_id", "enabled", "forwarding_host", "forwarding_port", "tcp_forwarding")
				.where("is_deleted", 0)
				.andWhere("enabled", 1),
		]);
		return { proxyHosts, streams };
	},
	check: (target) => checkTarget(target),
});

export default internalUpstream;
