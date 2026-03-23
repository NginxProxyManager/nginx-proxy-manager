import express from "express";
import internalLdapSettings from "../internal/ldap-settings.js";
import ldapSync from "../internal/ldap-sync.js";
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
 * /api/settings/ldap
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/settings/ldap
	 *
	 * Retrieve LDAP configuration (admin only).
	 * bind_password is masked as "••••••" if set.
	 */
	.get(async (req, res, next) => {
		try {
			// Verify admin access
			await res.locals.access.can("settings:get", "ldap");
			const config = await internalLdapSettings.getConfig();
			res.status(200).send(config);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/settings/ldap
	 *
	 * Update LDAP configuration (admin only).
	 */
	.put(async (req, res, next) => {
		try {
			// Verify admin access
			await res.locals.access.can("settings:update", "ldap");

			const schema = getValidationSchema("/settings/ldap", "put");
			const payload = schema ? await apiValidator(schema, req.body) : req.body;

			const result = await internalLdapSettings.updateConfig(payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/settings/ldap/test
 *
 * Test LDAP connection with the provided (or saved) config (admin only).
 * Returns { success, message }.
 */
router
	.route("/test")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("settings:update", "ldap");

			const result = await internalLdapSettings.testConnection(req.body || {});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/settings/ldap/test-auth
 *
 * Test LDAP authentication with a sample username/password (admin only).
 * Body: { username, password, ...optionalConfigOverrides }
 * Returns { success, message, user? }.
 */
router
	.route("/test-auth")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("settings:update", "ldap");

			const { username, password, ...configOverrides } = req.body || {};
			const result = await internalLdapSettings.testAuth(configOverrides, username, password);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/settings/ldap/sync
 *
 * Force re-synchronise ALL LDAP-sourced users (admin only).
 * Iterates all NPM accounts with auth_source='ldap', fetches current group
 * memberships from the LDAP server, updates roles, and disables accounts
 * for users removed from all allowed groups.
 *
 * Returns { synced, disabled, errors, details }.
 */
router
	.route("/sync")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("settings:update", "ldap");

			const result = await ldapSync.syncAllUsers();
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
