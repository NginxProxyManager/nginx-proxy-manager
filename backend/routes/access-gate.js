import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import internalAccessGate from "../internal/access-gate.js";
import validator from "../lib/validator/index.js";
import { debug, express as expressLogger, access as logger } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GATE_DIR = resolve(__dirname, "../gate");

/**
 * Sign-in pages and credential checks for access lists using security keys or tokens.
 *
 * nginx proxies /.npm-auth/ on each protected host to here, adding headers that say
 * which host the request was for. These routes don't use API tokens, and the admin
 * interface doesn't proxy them.
 */
const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router.use((_, res, next) => {
	// Only for pages on the protected site itself
	res.removeHeader("Access-Control-Allow-Origin");
	res.removeHeader("Access-Control-Allow-Credentials");
	res.set({
		"Content-Security-Policy":
			"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
		"Referrer-Policy": "no-referrer",
	});
	next();
});

const listIdSchema = { type: "integer", minimum: 1 };
const ceremonySchema = { type: "string", minLength: 1, maxLength: 64 };
const inviteSchema = { type: "string", minLength: 1, maxLength: 4096 };
const redirectSchema = { type: "string", maxLength: 4096 };
// WebAuthn responses are checked by @simplewebauthn/server, this just bounds their shape
const credentialSchema = {
	type: "object",
	required: ["id", "rawId", "type", "response"],
	properties: {
		id: { type: "string", minLength: 1, maxLength: 1400 },
		rawId: { type: "string", minLength: 1, maxLength: 1400 },
		type: { type: "string", const: "public-key" },
		response: { type: "object" },
	},
};

const sessionCookieOptions = (secure) => ({ path: "/", httpOnly: true, sameSite: "lax", secure });

const sendGateFile = (file, type) => (_, res) => {
	res.type(type).sendFile(`${GATE_DIR}/${file}`);
};

/**
 * GET /access-gate/check/123
 *
 * nginx auth_request: 204 if the request carries a valid credential for the list
 */
router.get("/check/:list_id", async (req, res) => {
	try {
		const { list_id } = await validator(
			{ type: "object", required: ["list_id"], properties: { list_id: listIdSchema } },
			{ list_id: req.params.list_id },
		);
		const ok = await internalAccessGate.checkRequest(list_id, req);
		res.sendStatus(ok ? 204 : 401);
	} catch (err) {
		logger.error(`Access list check failed: ${err.message}`);
		res.sendStatus(500);
	}
});

/**
 * ANY /access-gate/start/123
 *
 * nginx sends requests here when the check failed
 */
router.all("/start/:list_id", async (req, res, next) => {
	try {
		const { list_id } = await validator(
			{ type: "object", required: ["list_id"], properties: { list_id: listIdSchema } },
			{ list_id: req.params.list_id },
		);
		const challenge = await internalAccessGate.getChallenge(list_id, req);
		if (challenge.status === 302) {
			res.redirect(302, challenge.location);
			return;
		}
		if (challenge.basic) {
			res.set("WWW-Authenticate", 'Basic realm="Authorization required"');
		}
		res.status(401).type("text/plain").send("401 Unauthorized");
	} catch (err) {
		debug(expressLogger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
		next(err);
	}
});

router.get("/login", sendGateFile("login.html", "html"));
router.get("/enroll", sendGateFile("enroll.html", "html"));
router.get("/assets/gate.css", sendGateFile("gate.css", "css"));
router.get("/assets/gate.js", sendGateFile("gate.js", "js"));

/**
 * GET /access-gate/logout/123
 */
router.get("/logout/:list_id", async (req, res, next) => {
	try {
		const { list_id } = await validator(
			{ type: "object", required: ["list_id"], properties: { list_id: listIdSchema } },
			{ list_id: req.params.list_id },
		);
		const { name, secure } = internalAccessGate.getLogout(list_id, req);
		res.clearCookie(name, sessionCookieOptions(secure));
		res.redirect(302, "/");
	} catch (err) {
		next(err);
	}
});

/**
 * POST handler for the sign-in page API: validates the body, runs the handler and
 * sets the session cookie it may return
 *
 * @param {Object}   required  Schemas of the required body properties
 * @param {Object}   optional  Schemas of the optional ones
 * @param {Function} handler   (req, body) => Promise<Object>
 */
const api = (required, optional, handler) => async (req, res, next) => {
	try {
		const body = await validator(
			{
				type: "object",
				additionalProperties: false,
				required: Object.keys(required),
				properties: { ...required, ...optional },
			},
			req.body && typeof req.body === "object" ? req.body : {},
		);
		const { session, ...result } = await handler(req, body);
		if (session) {
			res.cookie(session.name, session.value, {
				...sessionCookieOptions(session.secure),
				maxAge: session.maxAge,
			});
		}
		res.status(200).send(result);
	} catch (err) {
		debug(expressLogger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
		next(err);
	}
};

router.post(
	"/api/methods",
	api({ list: listIdSchema }, {}, (req, body) => internalAccessGate.getMethods(body.list, req)),
);

router.post(
	"/api/login/options",
	api({ list: listIdSchema }, {}, (req, body) => internalAccessGate.getLoginOptions(body.list, req)),
);

router.post(
	"/api/login/verify",
	api(
		{ list: listIdSchema, ceremony: ceremonySchema, response: credentialSchema },
		{ rd: redirectSchema },
		(req, body) => internalAccessGate.verifyLogin(body.list, req, body),
	),
);

router.post(
	"/api/login/password",
	api(
		{
			list: listIdSchema,
			username: { type: "string", maxLength: 255 },
			password: { type: "string", maxLength: 1024 },
		},
		{ rd: redirectSchema },
		(req, body) => internalAccessGate.loginWithPassword(body.list, req, body),
	),
);

router.post(
	"/api/enroll/info",
	api({ token: inviteSchema }, {}, (req, body) => internalAccessGate.getEnrollmentInfo(req, body)),
);

router.post(
	"/api/enroll/options",
	api({ token: inviteSchema }, {}, (req, body) => internalAccessGate.getEnrollmentOptions(req, body)),
);

router.post(
	"/api/enroll/verify",
	api({ ceremony: ceremonySchema, response: credentialSchema }, {}, (req, body) =>
		internalAccessGate.verifyEnrollment(req, body),
	),
);

export default router;
