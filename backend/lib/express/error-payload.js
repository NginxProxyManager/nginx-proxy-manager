/**
 * Builds the JSON body the final express error handler sends for an error.
 *
 * Only public errors show their message and structured details. A regeneration
 * of all host configs that fails part way (the final nginx reload, or loading
 * the rows of a host type) carries the summary of what it already did as
 * `err.regenerateSummary`. That summary is sent as `regenerate_summary` for
 * public and internal errors alike: hosts may have been rewritten or taken
 * offline before the failure, and the admin who started the run needs to know
 * which. It only holds host types, ids, names and nginx messages, the same
 * data the successful response of the admin-only endpoint returns.
 *
 * @param   {Error}   err
 * @param   {Object}  [opts]
 * @param   {Boolean} [opts.debug]  add the stack trace
 * @returns {Object}
 */
const errorPayload = (err, opts = {}) => {
	const payload = {
		error: {
			code: err.status || 500,
			message: err.public ? err.message : "Internal Error",
		},
	};

	if (typeof err.message_i18n !== "undefined") {
		payload.error.message_i18n = err.message_i18n;
	}

	if (err.public && err.details && typeof err.details === "object") {
		payload.error.details = err.details;
	}

	if (err.regenerateSummary && typeof err.regenerateSummary === "object") {
		payload.error.regenerate_summary = err.regenerateSummary;
	}

	if (opts.debug) {
		payload.debug = {
			stack: typeof err.stack !== "undefined" && err.stack ? err.stack.split("\n") : null,
			previous: err.previous,
		};
	}

	return payload;
};

export default errorPayload;
