import express from "express";
import internalAuth from "../internal/auth.js";
import internalAuthProvider from "../internal/auth-provider.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import { debug, express as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/auth-providers
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/auth-providers
	 *
	 * Retrieve all configured authentication providers
	 */
	.get(async (req, res, next) => {
		try {
			const rows = await internalAuthProvider.getAll(res.locals.access);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * POST /api/auth-providers
	 *
	 * Create a new authentication provider
	 */
	.post(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/auth-providers", "post"), req.body);
			const result = await internalAuthProvider.create(res.locals.access, payload);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * /api/auth-providers/local
 *
 * The global toggle for email + password sign in. It lives here rather than
 * under /settings because turning it off is only safe in the context of the
 * configured providers.
 */
router
	.route("/local")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	.get(async (req, res, next) => {
		try {
			const enabled = await internalAuthProvider.isLocalAuthEnabled();
			res.status(200).send({ local_enabled: enabled });
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/auth-providers/local", "put"), req.body);
			const result = await internalAuthProvider.setLocalAuthEnabled(res.locals.access, payload.local_enabled);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * /api/auth-providers/123
 */
router
	.route("/:providerID")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/auth-providers/123
	 */
	.get(async (req, res, next) => {
		try {
			const row = await internalAuthProvider.get(res.locals.access, req.params.providerID);
			res.status(200).send(row);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/auth-providers/123
	 */
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/auth-providers/{providerID}", "put"), req.body);
			payload.id = Number.parseInt(req.params.providerID, 10);
			const result = await internalAuthProvider.update(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * DELETE /api/auth-providers/123
	 */
	.delete(async (req, res, next) => {
		try {
			const result = await internalAuthProvider.delete(res.locals.access, req.params.providerID);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/auth-providers/123/test
 *
 * Check that a provider's settings actually work, without signing anyone in.
 */
router
	.route("/:providerID/test")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			const callbackUrl = internalAuth.getCallbackUrl(req, req.params.providerID);
			const result = await internalAuthProvider.test(res.locals.access, req.params.providerID, callbackUrl);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/auth-providers/123/test-credentials
 *
 * Verify a real username and password against a directory, without signing in.
 */
router
	.route("/:providerID/test-credentials")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			const payload = await apiValidator(
				getValidationSchema("/auth-providers/{providerID}/test-credentials", "post"),
				req.body,
			);
			const result = await internalAuthProvider.testCredentials(
				res.locals.access,
				req.params.providerID,
				payload.username,
				payload.password,
			);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * /api/auth-providers/123/sync
 *
 * GET reports the last directory sync, POST starts one now.
 */
router
	.route("/:providerID/sync")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	.get(async (req, res, next) => {
		try {
			const result = await internalAuthProvider.getSyncStatus(res.locals.access, req.params.providerID);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	.post(async (req, res, next) => {
		try {
			const result = await internalAuthProvider.sync(res.locals.access, req.params.providerID);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
