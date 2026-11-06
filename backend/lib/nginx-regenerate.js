/**
 * Helpers for regenerating every host config at once, see internalNginx.regenerateAll() and
 * POST /api/nginx/regenerate. No database imports, so it can be unit tested.
 */

const HOST_TYPES = ["proxy_host", "redirection_host", "dead_host", "stream"];

/**
 * @param   {Array<String>} [hostTypes]
 * @returns {Array<String>} the known host types in a stable order, all of them when none are given
 */
const normaliseHostTypes = (hostTypes) => {
	if (!Array.isArray(hostTypes) || !hostTypes.length) {
		return [...HOST_TYPES];
	}
	return HOST_TYPES.filter((type) => hostTypes.includes(type));
};

/**
 * @param   {String} hostType
 * @param   {Object} row
 * @returns {String} the first domain name, or the incoming port of a stream
 */
const hostName = (hostType, row) => {
	if (Array.isArray(row?.domain_names) && row.domain_names.length) {
		return `${row.domain_names[0]}`;
	}
	if (hostType === "stream" && row?.incoming_port) {
		return `${row.incoming_port}`;
	}
	return `#${row?.id}`;
};

/**
 * @param   {Array} locations  meta.nginx_locations
 * @returns {String|null} what is wrong with the custom locations of a host that is online, or null
 */
const locationWarning = (locations) => {
	if (!Array.isArray(locations)) {
		return null;
	}
	const bad = locations.filter((loc) => loc?.status === "quarantined" || loc?.status === "unresolved");
	if (!bad.length) {
		return null;
	}
	return bad.map((loc) => `${loc.path}: ${loc.message || loc.status}`).join("\n");
};

const SUSPENDED_MESSAGE = "A certificate request for this host is running, it is configured again once that is done";

/**
 * @param   {Array<{hostType: String, row: Object, meta?: Object, error?: Error, suspended?: Boolean}>} results
 *          one entry per host: `meta` is what configure returned, `error` what it threw; `suspended` hosts were
 *          left alone because a certificate request has removed their config (see internalNginx.suspendHosts())
 * @returns {{checked: Number, regenerated: Number, offline: Array, failed: Array, warnings: Array, skipped: Array}}
 *          skipped hosts are not counted in `checked`
 */
const summarise = (results) => {
	const summary = { checked: 0, regenerated: 0, offline: [], failed: [], warnings: [], skipped: [] };
	for (const { hostType, row, meta, error, suspended } of results) {
		const item = { host_type: hostType, id: row.id, name: hostName(hostType, row) };
		if (suspended) {
			summary.skipped.push(Object.assign(item, { message: SUSPENDED_MESSAGE }));
			continue;
		}
		summary.checked++;
		if (error) {
			// Not a host level nginx error (eg. a certificate file is missing): the previous config was kept
			summary.failed.push(Object.assign(item, { error: `${error.message || error}` }));
			continue;
		}
		if (meta?.nginx_online === false) {
			summary.offline.push(Object.assign(item, { error: meta.nginx_err || "" }));
			continue;
		}
		summary.regenerated++;
		const message = locationWarning(meta?.nginx_locations);
		if (message) {
			summary.warnings.push(Object.assign(item, { message }));
		}
	}
	return summary;
};

const hostKey = (hostType, id) => `${hostType}:${id}`;

/**
 * The final `nginx -t` before the reload (testAndHeal) and the configure of a later host can still take hosts
 * offline that were configured fine, eg. a host blamed for a conflict with one configured after it, a host of a
 * type that was not selected, or a host whose aside file was just restored. Their state after the reload wins.
 *
 * @param   {Array}  results     see summarise()
 * @param   {Array<{hostType: String, row: Object}>} finalRows  rows (with meta) re-read after the reload, of
 *                               the hosts that were repaired or taken offline while regenerating
 * @returns {Object} summarise() of the final state; hosts outside `results` that are offline now are added to
 *                   `offline` (but not counted in `checked`)
 */
const summariseFinal = (results, finalRows = []) => {
	const finalByKey = new Map(finalRows.map((f) => [hostKey(f.hostType, f.row.id), f.row]));
	const seen = new Set();
	const merged = results.map((result) => {
		const key = hostKey(result.hostType, result.row.id);
		seen.add(key);
		const final = finalByKey.get(key);
		if (!final || result.suspended) {
			return result;
		}
		if (final.meta?.nginx_online === false) {
			// also when its config could not be generated: the previous config it kept was taken offline
			return { hostType: result.hostType, row: result.row, meta: final.meta };
		}
		if (result.error) {
			return result;
		}
		return Object.assign({}, result, { meta: final.meta || result.meta });
	});
	const summary = summarise(merged);
	for (const { hostType, row } of finalRows) {
		if (seen.has(hostKey(hostType, row.id)) || row.meta?.nginx_online !== false) {
			continue;
		}
		seen.add(hostKey(hostType, row.id));
		summary.offline.push({
			host_type: hostType,
			id: row.id,
			name: hostName(hostType, row),
			error: row.meta.nginx_err || "",
		});
	}
	return summary;
};

/**
 * @param   {Array|null}  hostTypes  as requested
 * @param   {Object|null} summary    may be partial (attached to the error) or missing
 * @param   {Error|null}  [error]
 * @returns {Object} the meta of the audit log entry of a regeneration
 */
const auditMeta = (hostTypes, summary, error = null) => {
	const meta = {
		host_types: hostTypes || null,
		checked: summary ? summary.checked : null,
		regenerated: summary ? summary.regenerated : null,
		offline: summary ? summary.offline.length : null,
		failed: summary ? summary.failed.length : null,
		warnings: summary ? summary.warnings.length : null,
		skipped: summary && Array.isArray(summary.skipped) ? summary.skipped.length : null,
		duration_ms: summary && typeof summary.duration_ms === "number" ? summary.duration_ms : null,
	};
	if (error) {
		meta.error = `${error.message || error}`;
	}
	return meta;
};

/**
 * Runs a regeneration and always writes its audit log entry, also when it failed half way (after hosts were
 * rewritten or taken offline already). A failing audit write is logged, it doesn't change the outcome.
 *
 * @param   {Object}   opts
 * @param   {Function} opts.run       () => Promise<summary>; a thrown error may carry `regenerateSummary`
 * @param   {Function} opts.audit     (meta) => Promise
 * @param   {Array}    [opts.hostTypes]
 * @param   {Function} [opts.onAuditError]  (err) => void
 * @returns {Promise<Object>} the summary
 */
const runAudited = async ({ run, audit, hostTypes, onAuditError }) => {
	let summary = null;
	let error = null;
	try {
		summary = await run();
		return summary;
	} catch (err) {
		error = err;
		summary = err?.regenerateSummary || null;
		throw err;
	} finally {
		try {
			await audit(auditMeta(hostTypes, summary, error));
		} catch (auditErr) {
			if (onAuditError) {
				onAuditError(auditErr);
			}
		}
	}
};

/**
 * Lets only one call run at a time, a second call while the first one runs fails with the error that
 * makeBusyError() returns.
 *
 * @param   {Function} makeBusyError
 * @returns {{run: Function, isRunning: Function}}
 */
const createSingleFlight = (makeBusyError) => {
	let running = false;
	return {
		run: async (fn) => {
			if (running) {
				throw makeBusyError();
			}
			running = true;
			try {
				return await fn();
			} finally {
				running = false;
			}
		},
		isRunning: () => running,
	};
};

export {
	auditMeta,
	createSingleFlight,
	HOST_TYPES,
	hostName,
	locationWarning,
	normaliseHostTypes,
	runAudited,
	summarise,
	summariseFinal,
};
