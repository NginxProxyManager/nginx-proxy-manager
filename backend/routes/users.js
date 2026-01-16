import express from "express";
import internal2FA from "../internal/2fa.js";
import internalUser from "../internal/user.js";
import Access from "../lib/access.js";
import { isCI } from "../lib/config.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import userIdFromMe from "../lib/express/user-id-from-me.js";
import apiValidator from "../lib/validator/api.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";
import { isSetup } from "../setup.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/users
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/users
	 *
	 * Retrieve all users
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						expand: {
							$ref: "common#/properties/expand",
						},
						query: {
							$ref: "common#/properties/query",
						},
					},
				},
				{
					expand:
						typeof req.query.expand === "string"
							? req.query.expand.split(",")
							: null,
					query: typeof req.query.query === "string" ? req.query.query : null,
				},
			);
			const users = await internalUser.getAll(
				res.locals.access,
				data.expand,
				data.query,
			);
			res.status(200).send(users);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * POST /api/users
	 *
	 * Create a new User
	 */
	.post(async (req, res, next) => {
		const body = req.body;

		try {
			// If we are in setup mode, we don't check access for current user
			const setup = await isSetup();
			if (!setup) {
				logger.info("Creating a new user in setup mode");
				const access = new Access(null);
				await access.load(true);
				res.locals.access = access;

				// We are in setup mode, set some defaults for this first new user, such as making
				// them an admin.
				body.is_disabled = false;
				if (typeof body.roles !== "object" || body.roles === null) {
					body.roles = [];
				}
				if (body.roles.indexOf("admin") === -1) {
					body.roles.push("admin");
				}
			}

			const payload = await apiValidator(
				getValidationSchema("/users", "post"),
				body,
			);
			const user = await internalUser.create(res.locals.access, payload);
			res.status(201).send(user);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * DELETE /api/users
	 *
	 * Deletes ALL users. This is NOT GENERALLY AVAILABLE!
	 * (!) It is NOT an authenticated endpoint.
	 * (!) Only CI should be able to call this endpoint. As a result,
	 *
	 * it will only work when the env vars DEBUG=true and CI=true
	 *
	 * Do NOT set those env vars in a production environment!
	 */
	.delete(async (_, res, next) => {
		if (isCI()) {
			try {
				logger.warn("Deleting all users - CI environment detected, allowing this operation");
				await internalUser.deleteAll();
				res.status(200).send(true);
			} catch (err) {
				debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
				next(err);
			}
			return;
		}

		next(new errs.ItemNotFoundError());
	});

/**
 * Specific user
 *
 * /api/users/123
 */
router
	.route("/:user_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.all(userIdFromMe)

	/**
	 * GET /users/123 or /users/me
	 *
	 * Retrieve a specific user
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["user_id"],
					additionalProperties: false,
					properties: {
						user_id: {
							$ref: "common#/properties/id",
						},
						expand: {
							$ref: "common#/properties/expand",
						},
					},
				},
				{
					user_id: req.params.user_id,
					expand:
						typeof req.query.expand === "string"
							? req.query.expand.split(",")
							: null,
				},
			);

			const user = await internalUser.get(res.locals.access, {
				id: data.user_id,
				expand: data.expand,
				omit: internalUser.getUserOmisionsByAccess(
					res.locals.access,
					data.user_id,
				),
			});
			res.status(200).send(user);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/users/123
	 *
	 * Update and existing user
	 */
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(
				getValidationSchema("/users/{userID}", "put"),
				req.body,
			);
			payload.id = req.params.user_id;
			const result = await internalUser.update(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * DELETE /api/users/123
	 *
	 * Update and existing user
	 */
	.delete(async (req, res, next) => {
		try {
			const result = await internalUser.delete(res.locals.access, {
				id: req.params.user_id,
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Specific user auth
 *
 * /api/users/123/auth
 */
router
	.route("/:user_id/auth")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.all(userIdFromMe)

	/**
	 * PUT /api/users/123/auth
	 *
	 * Update password for a user
	 */
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(
				getValidationSchema("/users/{userID}/auth", "put"),
				req.body,
			);
			payload.id = req.params.user_id;
			const result = await internalUser.setPassword(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Specific user permissions
 *
 * /api/users/123/permissions
 */
router
	.route("/:user_id/permissions")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.all(userIdFromMe)

	/**
	 * PUT /api/users/123/permissions
	 *
	 * Set some or all permissions for a user
	 */
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(
				getValidationSchema("/users/{userID}/permissions", "put"),
				req.body,
			);
			payload.id = req.params.user_id;
			const result = await internalUser.setPermissions(
				res.locals.access,
				payload,
			);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Specific user login as
 *
 * /api/users/123/login
 */
router
	.route("/:user_id/login")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/users/123/login
	 *
	 * Log in as a user
	 */
	.post(async (req, res, next) => {
		try {
			const result = await internalUser.loginAs(res.locals.access, {
				id: Number.parseInt(req.params.user_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * User 2FA status
 *
 * /api/users/123/2fa
 */
router
	.route("/:user_id/2fa")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.all(userIdFromMe)

	/**
	 * POST /api/users/123/2fa
	 *
	 * Start 2FA setup, returns QR code URL
	 */
	.post(async (req, res, next) => {
		try {
			const result = await internal2FA.startSetup(res.locals.access, req.params.user_id);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * GET /api/users/123/2fa
	 *
	 * Get 2FA status for a user
	 */
	.get(async (req, res, next) => {
		try {
			const status = await internal2FA.getStatus(res.locals.access, req.params.user_id);
			res.status(200).send(status);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * DELETE /api/users/123/2fa?code=XXXXXX
	 *
	 * Disable 2FA for a user
	 */
	.delete(async (req, res, next) => {
		try {
			const code = typeof req.query.code === "string" ? req.query.code : null;
			if (!code) {
				throw new errs.ValidationError("Missing required parameter: code");
			}
			await internal2FA.disable(res.locals.access, req.params.user_id, code);
			res.status(200).send(true);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * User 2FA enable
 *
 * /api/users/123/2fa/enable
 */
router
	.route("/:user_id/2fa/enable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.all(userIdFromMe)

	/**
	 * POST /api/users/123/2fa/enable
	 *
	 * Verify code and enable 2FA
	 */
	.post(async (req, res, next) => {
		try {
			const { code } = await apiValidator(
				getValidationSchema("/users/{userID}/2fa/enable", "post"),
				req.body,
			);
			const result = await internal2FA.enable(res.locals.access, req.params.user_id, code);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * User 2FA backup codes
 *
 * /api/users/123/2fa/backup-codes
 */
router
	.route("/:user_id/2fa/backup-codes")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.all(userIdFromMe)

	/**
	 * POST /api/users/123/2fa/backup-codes
	 *
	 * Regenerate backup codes
	 */
	.post(async (req, res, next) => {
		try {
			const { code } = await apiValidator(
				getValidationSchema("/users/{userID}/2fa/backup-codes", "post"),
				req.body,
			);
			const result = await internal2FA.regenerateBackupCodes(res.locals.access, req.params.user_id, code);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
