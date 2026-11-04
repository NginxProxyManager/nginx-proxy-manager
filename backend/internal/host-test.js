import _ from "lodash";
import errs from "../lib/error.js";
import {
	buildAsideWarnings,
	buildTestResult,
	buildTestTargets,
	checkTestTargets,
	mergeTargetResults,
	takePendingCertificate,
	WARNING_MESSAGES,
} from "../lib/host-test.js";
import { matchSavedLocations } from "../lib/nginx-locations.js";
import { checkTargets } from "../lib/upstream/check.js";
import { consumeCheckBudget } from "../lib/upstream/check-budget.js";
import { isUpstreamCheckEnabled } from "../lib/upstream/config.js";
import { TooManyRequestsError } from "../lib/upstream/errors.js";
import { createRateLimiter } from "../lib/upstream/rate-limit.js";
import { debug, global as logger } from "../logger.js";
import deadHostModel from "../models/dead_host.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import streamModel from "../models/stream.js";
import internalDeadHost from "./dead-host.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";
import internalProxyHost from "./proxy-host.js";
import internalRedirectionHost from "./redirection-host.js";
import internalStream from "./stream.js";

/**
 * "Test config": checks a host's settings the way a save would, without saving anything.
 * POST /api/nginx/(proxy-hosts|redirection-hosts|dead-hosts|streams)/test
 */

// Each test runs nginx -t; the upstream probes of a test are charged to the budget of /upstreams/check
const testLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });

const HOST_TYPES = {
	proxy_host: {
		model: proxyHostModel,
		permission: "proxy_hosts",
		hostnameType: "proxy",
		get: (access, data) => internalProxyHost.get(access, data),
		expand: ["owner", "certificate", "access_list.[clients,items]"],
		defaults: { advanced_config: "", locations: [] },
	},
	redirection_host: {
		model: redirectionHostModel,
		permission: "redirection_hosts",
		hostnameType: "redirection",
		get: (access, data) => internalRedirectionHost.get(access, data),
		expand: ["owner", "certificate"],
		defaults: { advanced_config: "" },
	},
	dead_host: {
		model: deadHostModel,
		permission: "dead_hosts",
		hostnameType: "dead",
		get: (access, data) => internalDeadHost.get(access, data),
		expand: ["owner", "certificate"],
		defaults: { advanced_config: "" },
	},
	stream: {
		model: streamModel,
		permission: "streams",
		hostnameType: null,
		get: (access, data) => internalStream.get(access, data),
		expand: ["owner", "certificate"],
		defaults: {},
	},
};

const ADVANCED_CONFIG_DENIED = "You do not have permission to modify advanced configuration";

/**
 * Users who aren't admins may not change advanced configs, see the create and update of each host type. A test
 * applies the same rule, so that it can't be used to run arbitrary advanced config through nginx -t. As in an
 * update, a location without advanced_config keeps the one of the saved location it replaces.
 *
 * @param   {Access}       access
 * @param   {String}       hostType
 * @param   {Object}       input    sanitised payload, locations are completed in place
 * @param   {Object|null}  row      the stored host when testing an edit
 * @throws  {PermissionError}
 */
const checkAdvancedConfigPermission = (access, hostType, input, row) => {
	if (hostType === "stream") {
		return;
	}
	const isAdmin = access.hasRole?.("admin") || access.token.hasScope("admin");
	if (isAdmin) {
		return;
	}
	const filled = (value) => typeof value === "string" && value.trim() !== "";
	if (!row) {
		if (filled(input.advanced_config)) {
			throw new errs.PermissionError(ADVANCED_CONFIG_DENIED);
		}
		if (
			hostType === "proxy_host" &&
			Array.isArray(input.locations) &&
			input.locations.some((loc) => filled(loc?.advanced_config))
		) {
			throw new errs.PermissionError(ADVANCED_CONFIG_DENIED);
		}
		return;
	}
	if (typeof input.advanced_config !== "undefined" && input.advanced_config !== row.advanced_config) {
		throw new errs.PermissionError(ADVANCED_CONFIG_DENIED);
	}
	if (hostType === "proxy_host" && Array.isArray(input.locations)) {
		const existing = matchSavedLocations(input.locations, row.locations);
		input.locations = input.locations.map((loc, i) => {
			const existingAdv = existing[i]?.advanced_config || "";
			if (!loc || typeof loc !== "object") {
				return loc;
			}
			if (typeof loc.advanced_config === "undefined") {
				return Object.assign({}, loc, { advanced_config: existingAdv });
			}
			if ((loc.advanced_config || "") !== existingAdv) {
				throw new errs.PermissionError(ADVANCED_CONFIG_DENIED);
			}
			return loc;
		});
	}
};

const internalHostTest = {
	/**
	 * @param   {Access}  access
	 * @param   {String}  hostType  proxy_host, redirection_host, dead_host or stream
	 * @param   {Object}  data      the create payload of that host type, plus `id` when testing an edit
	 * @returns {Promise<Object>}   see lib/host-test.js buildTestResult()
	 */
	test: async (access, hostType, data) => {
		const type = HOST_TYPES[hostType];
		if (!type) {
			throw new errs.InternalValidationError(`Unknown host type ${hostType}`);
		}

		// Same input hygiene as create/update: strips server-owned meta, trims hosts, duplicate location paths
		// and forbidden file directives are 400s
		const input = internalHost.sanitiseInput(structuredClone(data || {}));
		const id = input.id ? Number.parseInt(input.id, 10) : null;
		delete input.id;

		if (id) {
			await access.can(`${type.permission}:update`, id);
		} else {
			await access.can(`${type.permission}:create`, input);
		}

		const limit = testLimiter.consume(`${access.token.getUserId(0)}`);
		if (!limit.ok) {
			throw new TooManyRequestsError(
				`Too many configuration tests. Try again in ${limit.retryAfter} seconds.`,
				limit.retryAfter,
			);
		}

		// certificate_id "new": checked without SSL
		const warnings = takePendingCertificate(input);

		if (type.hostnameType && Array.isArray(input.domain_names)) {
			const results = await Promise.all(
				input.domain_names.map((name) =>
					internalHost.isHostnameTaken(name, id ? type.hostnameType : undefined, id || undefined),
				),
			);
			for (const result of results) {
				if (result.is_taken) {
					throw new errs.ValidationError(`${result.hostname} is already in use`);
				}
			}
		}

		const host = await internalHostTest.buildHost(access, type, hostType, id, input);
		const targets = buildTestTargets(hostType, host);

		const [dry, checked] = await Promise.all([
			internalNginx.dryRun(type.model, hostType, host),
			checkTestTargets(targets, {
				enabled: isUpstreamCheckEnabled(),
				consume: (units) => consumeCheckBudget(access, units),
				check: checkTargets,
			}),
		]);

		let error = dry.error;
		if (error) {
			error = await internalNginx.redactConfigError(access, error);
			if (!id && error.details) {
				// The temporary config of a new host is no file the user can look at
				error.details = Object.assign({}, error.details, {
					host_id: error.details.host_id === internalNginx.DRY_RUN_ID ? null : error.details.host_id,
					file: `${error.details.file || ""}`.includes(internalNginx.DRY_RUN_ID) ? null : error.details.file,
				});
			}
		}

		warnings.push(
			...(await buildAsideWarnings(dry.aside, (other) =>
				internalNginx.canSeeHost(access, other.host_type, other.host_id),
			)),
		);
		if (checked.rateLimited !== null) {
			warnings.push({
				code: "upstreams_rate_limited",
				message: WARNING_MESSAGES.upstreams_rate_limited(checked.rateLimited),
			});
		}

		const result = buildTestResult({
			meta: dry.meta,
			error,
			locations: dry.locations,
			upstreams: mergeTargetResults(targets, checked.results),
			warnings,
		});
		debug(
			logger,
			`Config test of ${hostType} ${id ? `#${id}` : "(new)"}: ok=${result.ok} online=${result.nginx_online}`,
		);
		return result;
	},

	/**
	 * The host as a save would store and configure it
	 *
	 * @param   {Access}       access
	 * @param   {Object}       type    entry of HOST_TYPES
	 * @param   {String}       hostType
	 * @param   {Number|null}  id
	 * @param   {Object}       input   sanitised payload
	 * @returns {Promise<Object>}
	 */
	buildHost: async (access, type, hostType, id, input) => {
		let host;
		if (id) {
			const row = await type.get(access, { id, expand: type.expand });
			checkAdvancedConfigPermission(access, hostType, input, row);
			// the payload is merged over the stored row, like update does
			host = internalHost.cleanSslHstsData(input, row);
			host.id = row.id;
			host.meta = _.assign({}, row.meta || {}, input.meta || {});
		} else {
			checkAdvancedConfigPermission(access, hostType, input, null);
			host = internalHost.cleanSslHstsData(Object.assign({}, type.defaults, input));
			host.id = internalNginx.DRY_RUN_ID;
			host.owner_user_id = access.token.getUserId(1);
			host.meta = input.meta || {};
			if (typeof host.enabled === "undefined") {
				host.enabled = true;
			}
		}

		// Relations of the stored row that the payload changed are (re)loaded by nginx.loadRenderRelations()
		if (!(host.certificate_id > 0)) {
			host.certificate = null;
		}
		if (!(host.access_list_id > 0)) {
			host.access_list = null;
		}
		if (Array.isArray(host.domain_names)) {
			host.domain_names = [...host.domain_names].sort();
		}
		if (hostType === "stream") {
			// streams aren't routed by domain name
			delete host.domain_names;
		}
		return host;
	},
};

export default internalHostTest;
