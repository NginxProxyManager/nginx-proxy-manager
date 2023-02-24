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
		console.log("oidc: init flow");
		settingModel
			.query()
			.where({id: 'oidc-config'})
			.first()
			.then( row => getInitParams(req, row))
			.then( params => redirectToAuthorizationURL(res, params));
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
		console.log("oidc: callback");
		settingModel
			.query()
			.where({id: 'oidc-config'})
			.first()
			.then( settings => validateCallback(req, settings))
			.then( token => redirectWithJwtToken(res, token))
			.catch( err => redirectWithError(res, err));
	});

/**
 * Executed discovery and returns the configured `openid-client` client
 *
 * @param {Setting} row
 * */
let getClient = async row => {
	let issuer = await oidc.Issuer.discover(row.meta.issuerURL);

	return new issuer.Client({
		client_id: row.meta.clientID,
		client_secret: row.meta.clientSecret,
		redirect_uris: [row.meta.redirectURL],
		response_types: ['code'],
	});
}

/**
 * Generates state, nonce and authorization url.
 *
 * @param {Request} req
 * @param {Setting} row
 * @return { {String}, {String}, {String} } state, nonce and url
 * */
let getInitParams = async (req, row) => {
	let client = await getClient(row);
	let state = crypto.randomUUID();
	let nonce = crypto.randomUUID();
	let url = client.authorizationUrl({
		scope: 'openid email profile',
		resource: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
		state,
		nonce,
	})

	return { state, nonce, url };
}

/**
 * Parses state and nonce from cookie during the callback phase.
 *
 * @param {Request} req
 * @return { {String}, {String} } state and nonce
 * */
let parseStateFromCookie = req => {
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

	return { state, nonce };
}

/**
 * Executes validation of callback parameters.
 *
 * @param {Request} req
 * @param {Setting} settings
 * @return {Promise} a promise resolving to a jwt token
 * */
let validateCallback =  async (req, settings) => {
	let client = await getClient(settings);
	let { state, nonce } = parseStateFromCookie(req);

	const params = client.callbackParams(req);
	const tokenSet = await client.callback(settings.meta.redirectURL, params, { state, nonce });
	let claims = tokenSet.claims();
	console.log('oidc: authentication successful for email', claims.email);

	return internalToken.getTokenFromOAuthClaim({ identity: claims.email })
}

let redirectToAuthorizationURL = (res, params) => {
	console.log('oidc: init flow > url > ', params.url);
	res.cookie("npm_oidc", params.state + '--' + params.nonce);
	res.redirect(params.url);
}

let redirectWithJwtToken = (res, token) => {
	res.cookie('npm_oidc', token.token + '---' + token.expires);
	res.redirect('/login');
}

let redirectWithError = (res, error) => {
	console.log('oidc: callback error: ', error);
	res.cookie('npm_oidc_error', error.message);
	res.redirect('/login');
}

module.exports = router;
