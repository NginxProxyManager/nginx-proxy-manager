const express       = require('express');
const jwtdecode     = require('../../lib/express/jwt-decode');
const internalToken = require('../../internal/token');
const apiValidator  = require('../../lib/validator/api');

let router = express.Router({
	caseSensitive: true,
	strict:        true,
	mergeParams:   true
});

router
	.route('/')
	.options((req, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET /tokens
	 *
	 * Get a new Token, given they already have a token they want to refresh
	 * We also piggy back on to this method, allowing admins to get tokens
	 * for services like Job board and Worker.
	 */
	.get(jwtdecode(), (req, res, next) => {
		internalToken.getFreshToken(res.locals.access, {
			expiry: (typeof req.query.expiry !== 'undefined' ? req.query.expiry : null),
			scope:  (typeof req.query.scope !== 'undefined' ? req.query.scope : null)
		})
			.then((data) => {
				res.status(200)
					.send(data);
			})
			.catch(next);
	})

	/**
	 * POST /tokens
	 *
	 * Create a new Token
	 */
	.post((req, res, next) => {
		apiValidator({$ref: 'endpoints/tokens#/links/0/schema'}, req.body)
			.then((payload) => {
				return internalToken.getTokenFromEmail(payload);
			})
			.then((data) => {
				res.status(200)
					.send(data);
			})
			.catch(next);
	});

module.exports = router;
