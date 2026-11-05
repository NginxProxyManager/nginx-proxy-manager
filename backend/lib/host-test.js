import { buildHealthTargets } from "./upstream/health.js";

/**
 * Pure helpers of the "Test config" endpoints (POST /nginx/<host type>/test), see internal/host-test.js
 */

const MAX_TEST_TARGETS = 20;

const WARNING_MESSAGES = {
	certificate_pending:
		"A new certificate is requested when you save. The test checked the host without SSL, the SSL part is checked when the certificate is added.",
	upstreams_rate_limited: (retryAfter) =>
		`Reachability was not checked: too many upstream checks in the last minute. Try again in ${retryAfter} seconds.`,
	other_host_hidden:
		"Nginx rejects the current configuration of another host. Saving would repair or disable that host. Please ask an administrator to check it.",
};

/**
 * The test checks a host as it runs once enabled, also when it is (still) disabled: a disabled host renders an
 * empty config, nginx -t would accept anything. Returns a copy, the host itself is not changed.
 *
 * @param   {Object} host
 * @returns {Object}
 */
const asEnabled = (host) => Object.assign({}, host, { enabled: true });

/**
 * The upstream targets of a host, the same ones the health monitor probes: the main forward target and every
 * enabled custom location (proxy hosts), the forwarding target (TCP streams). Redirection and 404 hosts have none.
 *
 * @param   {String} hostType  proxy_host, redirection_host, dead_host or stream
 * @param   {Object} host
 * @returns {Array<{location_index: number|null, path?: string, host: string, port: number, scheme: string|null}>}
 */
const buildTestTargets = (hostType, host) => {
	if (!host || !["proxy_host", "stream"].includes(hostType)) {
		return [];
	}
	const row = asEnabled(host);
	const built = buildHealthTargets(hostType === "proxy_host" ? { proxyHosts: [row] } : { streams: [row] });
	return (built[0]?.targets || []).slice(0, MAX_TEST_TARGETS);
};

/**
 * @param   {Array} [locations]  meta.nginx_locations
 * @returns {boolean} true when a custom location was quarantined (nginx rejected it, it would be replaced by a stub)
 */
const hasQuarantinedLocation = (locations) =>
	Array.isArray(locations) && locations.some((location) => location?.status === "quarantined");

/**
 * Builds the response of a config test.
 *
 * ok: nginx accepts the configuration as entered: the host would be online and no custom location would be
 * quarantined. Unresolved locations and unreachable upstreams don't make the test fail, they are reported in
 * nginx_locations and upstreams.
 *
 * @param   {Object}       input
 * @param   {Object|null}  input.meta       the meta a save would write (null when nginx rejected the host)
 * @param   {Error|null}   input.error      the host level error a save would fail with
 * @param   {Array|null}   input.locations  location states, also known when nginx rejected the host
 * @param   {Array}        [input.upstreams]  check results, with location_index and path
 * @param   {Array}        [input.warnings]   [{code, message}]
 * @returns {Object}
 */
const buildTestResult = ({ meta, error, locations, upstreams = [], warnings = [] }) => {
	const nginxOnline = !error && meta?.nginx_online !== false;
	const nginxLocations = Array.isArray(meta?.nginx_locations)
		? meta.nginx_locations
		: Array.isArray(locations)
			? locations
			: [];
	return {
		ok: nginxOnline && !hasQuarantinedLocation(nginxLocations),
		nginx_online: nginxOnline,
		nginx_err: error ? error.message : null,
		nginx_details: error?.details || null,
		nginx_locations: nginxLocations,
		upstreams,
		warnings,
	};
};

/**
 * certificate_id "new": the certificate is only requested by a save, so the test checks the host without SSL, like
 * create/update do before the certificate exists. Sets certificate_id to 0 rather than deleting it: on an edit the
 * payload is merged over the stored row, which would otherwise bring back the host's current certificate (and its
 * files, which may be gone, a common reason to request a new one).
 *
 * @param   {Object} input  sanitised payload, changed in place
 * @returns {Array}  the warnings to show: certificate_pending, or none
 */
const takePendingCertificate = (input) => {
	if (input?.certificate_id !== "new") {
		return [];
	}
	input.certificate_id = 0;
	return [{ code: "certificate_pending", message: WARNING_MESSAGES.certificate_pending }];
};

/**
 * The warnings about other hosts whose broken config the test left out (internal/nginx.js dryRun() `aside`):
 * a save would repair or disable them. Hosts the user can't see are not named.
 *
 * @param   {Array<{host_type: string, host_id: number, message: string}>} aside
 * @param   {function(Object): Promise<boolean>} canSee
 * @returns {Promise<Array>}
 */
const buildAsideWarnings = async (aside, canSee) => {
	const warnings = [];
	for (const other of aside || []) {
		warnings.push(
			(await canSee(other))
				? {
						code: "other_host_broken",
						message: `${other.message} Saving would repair or disable it.`,
						host_type: other.host_type,
						host_id: other.host_id,
					}
				: {
						code: "other_host_broken",
						message: WARNING_MESSAGES.other_host_hidden,
						host_type: null,
						host_id: null,
					},
		);
	}
	return warnings;
};

/**
 * Stand-in for a check result when the user's probe budget is used up: same shape as a check result, nothing probed
 *
 * @param   {{host: string, port: number, scheme?: string|null}} target
 * @param   {number} retryAfter  seconds
 * @returns {Object}
 */
const rateLimitedResult = (target, retryAfter) => ({
	host: `${target.host ?? ""}`.trim(),
	port: Number.isInteger(target.port) ? target.port : null,
	scheme: target.scheme ?? null,
	ok: false,
	code: "rate_limited",
	message: WARNING_MESSAGES.upstreams_rate_limited(retryAfter),
	addresses: [],
	resolver_ok: null,
	system_ok: null,
	ms: null,
});

/**
 * Probes the targets of a test, charging the probe budget that POST /upstreams/check uses (one unit per target),
 * so the test is no way around that limit. When the budget is used up the nginx test still runs; the targets are
 * reported as code "rate_limited" without being probed.
 *
 * @param   {Array}    targets   from buildTestTargets()
 * @param   {Object}   opts
 * @param   {boolean}  opts.enabled  NPM_UPSTREAM_CHECK; disabled checks touch no network and cost nothing
 * @param   {function(number): {ok: boolean, retryAfter: number}} opts.consume  charges the budget
 * @param   {function(Array, Object): Promise<Array>} opts.check  checkTargets()
 * @returns {Promise<{results: Array, rateLimited: number|null}>}  rateLimited: retry after (seconds), or null
 */
const checkTestTargets = async (targets, { enabled, consume, check }) => {
	if (!targets.length) {
		return { results: [], rateLimited: null };
	}
	if (enabled) {
		const limit = consume(targets.length);
		if (!limit.ok) {
			return {
				results: targets.map((target) => rateLimitedResult(target, limit.retryAfter)),
				rateLimited: limit.retryAfter,
			};
		}
	}
	return { results: await check(targets, { enabled }), rateLimited: null };
};

/**
 * Puts the check results next to the targets they belong to
 *
 * @param   {Array} targets  from buildTestTargets()
 * @param   {Array} results  from checkTargets(), same order
 * @returns {Array}
 */
const mergeTargetResults = (targets, results) =>
	targets.map((target, index) =>
		Object.assign({}, results[index], {
			location_index: target.location_index ?? null,
			path: typeof target.path === "string" ? target.path : null,
		}),
	);

export {
	asEnabled,
	buildAsideWarnings,
	buildTestResult,
	buildTestTargets,
	checkTestTargets,
	hasQuarantinedLocation,
	MAX_TEST_TARGETS,
	mergeTargetResults,
	rateLimitedResult,
	takePendingCertificate,
	WARNING_MESSAGES,
};
