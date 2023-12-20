const express         = require('express');
const jwtdecode       = require('../../lib/express/jwt-decode');
const internalOpenappsecSetting = require('../../internal/setting-openappsec');

let router = express.Router({
	caseSensitive: true,
	strict:        true,
	mergeParams:   true
});

/**
 * /api/openappsec-settings
 */
router
	.route('/')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/openappsec-settings
	 * 
	 * Retrieve the open-appsec local policy.
	 */
	.get((req, res, next) => {
		return internalOpenappsecSetting.getLocalPolicy(res.locals.access)
			.then((policy) => {
				res.status(200)
					.send(policy);
			})
			.catch(next);
	})

	/**
	 * PUT /api/openappsec-settings
	 *
	 * Update the open-appsec local policy.
	 */
	.put((req, res, next) => {
		return internalOpenappsecSetting.updateLocalPolicy(res.locals.access, req.body)
			.then((result) => {
				res.status(200)
					.send(result);
			})
			.catch(next);
	});

module.exports = router;
