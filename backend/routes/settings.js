import express from "express";
import internalSetting from "../internal/setting.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/settings
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/settings
	 *
	 * Retrieve all settings
	 */
	.get(async (req, res, next) => {
		try {
			const rows = await internalSetting.getAll(res.locals.access);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Specific setting
 *
 * /api/settings/something
 */
router
	.route("/:setting_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /settings/something
	 *
	 * Retrieve a specific setting
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["setting_id"],
					additionalProperties: false,
					properties: {
						setting_id: {
							type: "string",
							minLength: 1,
						},
					},
				},
				{
					setting_id: req.params.setting_id,
				},
			);
			const row = await internalSetting.get(res.locals.access, {
				id: data.setting_id,
			});
			res.status(200).send(row);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/settings/something
	 *
	 * Update and existing setting
	 */
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/settings/{settingID}", "put"), req.body);
			payload.id = req.params.setting_id;
			const result = await internalSetting.update(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
