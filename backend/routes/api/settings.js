const express         = require('express');
const validator       = require('../../lib/validator');
const jwtdecode       = require('../../lib/express/jwt-decode');
const internalSetting = require('../../internal/setting');
const apiValidator    = require('../../lib/validator/api');

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
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/settings
	 *
	 * Retrieve all settings
	 */
	.get((req, res, next) => {
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
	.options((req, res) => {
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
					$ref: 'definitions#/definitions/setting_id'
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
		apiValidator({$ref: 'endpoints/settings#/links/1/schema'}, req.body)
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
