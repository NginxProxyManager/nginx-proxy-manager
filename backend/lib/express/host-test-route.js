import internalHostTest from "../../internal/host-test.js";
import { debug, express as logger } from "../../logger.js";
import { getValidationSchema } from "../../schema/index.js";
import { TooManyRequestsError } from "../upstream/errors.js";
import apiValidator from "../validator/api.js";
import jwtdecode from "./jwt-decode.js";

// nginx -t can be repeated a few times (custom locations, broken files of other hosts) and the upstream checks
// take up to a few seconds, like the certificate HTTP test
const REQUEST_TIMEOUT_MS = 60000;

/**
 * Adds POST <router>/test ("Test config") to a host router. Register it BEFORE the `/:id` routes.
 *
 * @param {Object} router
 * @param {Object} opts
 * @param {String} opts.schemaPath  eg. "/nginx/proxy-hosts/test"
 * @param {String} opts.hostType    proxy_host, redirection_host, dead_host or stream
 */
const addHostTestRoute = (router, { schemaPath, hostType }) => {
	router
		.route("/test")
		.options((_, res) => {
			res.sendStatus(204);
		})
		.all(jwtdecode())

		/**
		 * POST /api/nginx/<host type>/test
		 *
		 * Checks the settings of a new or edited host without saving them
		 */
		.post(async (req, res, next) => {
			try {
				req.setTimeout(REQUEST_TIMEOUT_MS);
				const payload = await apiValidator(getValidationSchema(schemaPath, "post"), req.body);
				const result = await internalHostTest.test(res.locals.access, hostType, payload);
				res.status(200).send(result);
			} catch (err) {
				if (err instanceof TooManyRequestsError && err.retry_after) {
					res.set("Retry-After", `${err.retry_after}`);
				}
				debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
				next(err);
			}
		});
};

export default addHostTestRoute;
