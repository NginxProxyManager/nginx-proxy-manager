const crypto        = require('crypto');
const express       = require('express');
const jwtdecode     = require('../../lib/express/jwt-decode');
const oidc          = require('openid-client');
const settingModel   = require('../../models/setting');
const internalToken = require('../../internal/token');

let router = express.Router({
	caseSensitive: true,
	strict:        true,
	mergeParams:   true
});

/**
 * OAuth Authorization Code flow initialisation
 *
 * /api/oidc
 */
router
	.route('/')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/users
	 *
	 * Retrieve all users
	 */
	.get(jwtdecode(), async (req, res, next) => {
		console.log("oidc init >>>", res.locals.access, oidc);

		settingModel
			.query()
			.where({id: 'oidc-config'})
			.first()
			.then( async row => {
				console.log('oidc init > config > ', row);

				let issuer = await oidc.Issuer.discover(row.meta.issuerURL);
				let client = new issuer.Client({
					client_id: row.meta.clientID,
					client_secret: row.meta.clientSecret,
					redirect_uris: [row.meta.redirectURL],
					response_types: ['code'],
				})
				let state = crypto.randomUUID();
				let nonce = crypto.randomUUID();
				let url = client.authorizationUrl({
					scope: 'openid email profile',
					resource: 'http://rye.local:2081/api/oidc/callback',
					state,
					nonce,
				})

				console.log('oidc init > url > ', state, nonce, url);

				res.cookie("npm_oidc", state + '--' + nonce);
				res.redirect(url);
			});
	});


/**
 * Oauth Authorization Code flow callback
 *
 * /api/oidc/callback
 */
router
	.route('/callback')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /users/123 or /users/me
	 *
	 * Retrieve a specific user
	 */
	.get(jwtdecode(), async (req, res, next) => {
		console.log("oidc callback >>>");

		settingModel
			.query()
			.where({id: 'oidc-config'})
			.first()
			.then( async row => {
				console.log('oidc callback > config > ', row);

				let issuer = await oidc.Issuer.discover(row.meta.issuerURL);
				let client = new issuer.Client({
					client_id: row.meta.clientID,
					client_secret: row.meta.clientSecret,
					redirect_uris: [row.meta.redirectURL],
					response_types: ['code'],
				});

				let state, nonce;
				let cookies = req.headers.cookie.split(';');
				for (cookie of cookies) {
					if (cookie.split('=')[0].trim() === 'npm_oidc') {
						let raw = cookie.split('=')[1];
						let val = raw.split('--');
						state = val[0].trim();
						nonce = val[1].trim();
						break;
					}
				}

				const params = client.callbackParams(req);
				const tokenSet = await client.callback(row.meta.redirectURL, params, { /*code_verifier: verifier,*/ state, nonce });
				let claims = tokenSet.claims();
				console.log('validated ID Token claims %j', claims);

				return internalToken.getTokenFromOAuthClaim({ identity: claims.email })

			})
			.then( response => {
				console.log('oidc callback > signed token > >', response);
				res.cookie('npm_oidc', response.token + '---' + response.expires);
				res.redirect('/login');
			})
			.catch( err => {
				console.log('oidc callback ERR > ', err);
				res.cookie('npm_oidc_error', err.message);
				res.redirect('/login');
			});
	});

module.exports = router;
