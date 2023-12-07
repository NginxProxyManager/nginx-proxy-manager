const express          = require('express');
const jwtdecode        = require('../../lib/express/jwt-decode');
const internalOpenappsecLog = require('../../internal/openappsec-log');

let router = express.Router({
	caseSensitive: true,
	strict:        true,
	mergeParams:   true
});

/**
 * /api/openappsec-log
 */
router
	.route('/')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/openappsec-log
	 *
	 * Retrieve all logs
	 */
	.get((req, res, next) => {
		return internalOpenappsecLog.getAll(res.locals.access)
			.then((policy) => {
				res.status(200)
					.send(policy);
			})
			.catch(next);
	});

module.exports = router;
