import errs from "../lib/error.js";
import { createSingleFlight, runAudited } from "../lib/nginx-regenerate.js";
import { nginx as logger } from "../logger.js";
import internalAuditLog from "./audit-log.js";
import internalNginx from "./nginx.js";

const flight = createSingleFlight(
	() => new errs.ConflictError("All host configs are being regenerated already, wait for that to finish."),
);

const internalNginxRegenerate = {
	/**
	 * Rewrites the config files of all enabled hosts from the database and reloads nginx once,
	 * see internalNginx.regenerateAll(). Admin only, one run at a time.
	 *
	 * @param   {Access}  access
	 * @param   {Object}  [data]
	 * @param   {Array}   [data.host_types]  default all
	 * @returns {Promise<Object>} {checked, regenerated, offline, failed, warnings, duration_ms}
	 */
	regenerate: async (access, data = {}) => {
		await access.can("nginx:regenerate");
		return flight.run(() =>
			runAudited({
				hostTypes: data.host_types,
				run: () => internalNginx.regenerateAll({ hostTypes: data.host_types }),
				// Also on failure: hosts may have been rewritten or taken offline before it failed
				audit: (meta) =>
					internalAuditLog.add(access, {
						action: "regenerated",
						object_type: "nginx-config",
						object_id: 0,
						meta,
					}),
				onAuditError: (err) =>
					logger.error(`Could not write the audit log entry of a regeneration: ${err.message}`),
			}),
		);
	},
};

export default internalNginxRegenerate;
