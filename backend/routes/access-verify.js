import express from "express";
import internalAccessList from "../internal/access-list.js";
import { auth as authLogger, debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * Reads an HTTP Basic header.
 *
 * The password may itself contain a colon, so only the first one separates the
 * two halves.
 *
 * @param   {String} header
 * @returns {Object|null}
 */
const parseBasicAuth = (header) => {
	if (typeof header !== "string") {
		return null;
	}

	const [scheme, encoded] = header.split(" ");
	if (!encoded || scheme.toLowerCase() !== "basic") {
		return null;
	}

	let decoded;
	try {
		decoded = Buffer.from(encoded, "base64").toString("utf8");
	} catch (_) {
		return null;
	}

	const separator = decoded.indexOf(":");
	if (separator === -1) {
		return null;
	}

	return {
		username: decoded.slice(0, separator),
		password: decoded.slice(separator + 1),
	};
};

/**
 * GET /access-lists/123/verify
 *
 * The target of nginx's auth_request for access lists that accept provider
 * accounts. Answers 204 to let the request through, or 401 with a challenge so
 * the browser prompts.
 *
 * Unauthenticated on purpose: it is the visitor's own credentials being
 * checked. The reply is only ever pass or fail, and never says whether the
 * username exists, so it gives away nothing a login form does not.
 */
router
	.route("/:listID/verify")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(async (req, res) => {
		const challenge = () => {
			// nginx copies this onto its own 401 so the browser knows to prompt
			res.set("WWW-Authenticate", 'Basic realm="Authorization required"');
			res.status(401).send();
		};

		try {
			const credentials = parseBasicAuth(req.headers.authorization);
			if (!credentials) {
				return challenge();
			}

			const result = await internalAccessList.verifyCredentials(
				req.params.listID,
				credentials.username,
				credentials.password,
			);

			if (!result.allowed) {
				authLogger.debug(
					`Access list ${req.params.listID}: denied "${credentials.username}" (${result.reason})`,
				);
				return challenge();
			}

			if (!result.cached) {
				authLogger.info(
					`Access list ${req.params.listID}: allowed "${credentials.username}" via ${result.via}`,
				);
			}

			// Handed back to nginx, which can forward them to the proxied app
			res.set("X-Auth-User", credentials.username);
			if (result.email) {
				res.set("X-Auth-Email", result.email);
			}
			return res.status(204).send();
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			// Failing closed: a broken directory must not open a protected site
			return challenge();
		}
	});

export default router;
