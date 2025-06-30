const express         = require('express');
const validator       = require('../lib/validator');
const jwtdecode       = require('../lib/express/jwt-decode');
const apiValidator    = require('../lib/validator/api');
const internalSetting = require('../internal/setting');
const schema          = require('../schema');

let router = express.Router({
	caseSensitive: true,
	strict:        true,
	mergeParams:   true
});

/**
 * /api/settings
 */
router
	.route('/')
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/settings
	 *
	 * Retrieve all settings
	 */
	.get((_, res, next) => {
		internalSetting.getAll(res.locals.access)
			.then((rows) => {
				res.status(200)
					.send(rows);
			})
			.catch(next);
	});

/**
 * Specific setting
 *
 * /api/settings/something
 */
router
	.route('/:setting_id')
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /settings/something
	 *
	 * Retrieve a specific setting
	 */
	.get((req, res, next) => {
		validator({
			required:             ['setting_id'],
			additionalProperties: false,
			properties:           {
				setting_id: {
					type:      'string',
					minLength: 1
				}
			}
		}, {
			setting_id: req.params.setting_id
		})
			.then((data) => {
				return internalSetting.get(res.locals.access, {
					id: data.setting_id
				});
			})
			.then((row) => {
				res.status(200)
					.send(row);
			})
			.catch(next);
	})

	/**
	 * PUT /api/settings/something
	 *
	 * Update and existing setting
	 */
	.put((req, res, next) => {
		apiValidator(schema.getValidationSchema('/settings/{settingID}', 'put'), req.body)
			.then((payload) => {
				payload.id = req.params.setting_id;
				return internalSetting.update(res.locals.access, payload);
			})
			.then((result) => {
				res.status(200)
					.send(result);
			})
			.catch(next);
	});

module.exports = router;
