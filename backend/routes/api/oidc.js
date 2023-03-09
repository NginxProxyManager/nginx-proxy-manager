const crypto        = require('crypto');
const error         = require('../../lib/error');
const express       = require('express');
const jwtdecode     = require('../../lib/express/jwt-decode');
const logger        = require('../../logger').oidc;
const oidc          = require('openid-client');
const settingModel  = require('../../models/setting');
const internalToken = require('../../internal/token');

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
	.all(jwtdecode())

	/**
	 * GET /api/oidc
	 *
	 * OAuth Authorization Code flow initialisation
	 */
	.get(jwtdecode(), async (req, res) => {
		logger.info('Initializing OAuth flow');
		settingModel
			.query()
			.where({id: 'oidc-config'})
			.first()
			.then((row) => getInitParams(req, row))
			.then((params) => redirectToAuthorizationURL(res, params))
			.catch((err) => redirectWithError(res, err));
	});


router
	.route('/callback')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/oidc/callback
	 *
	 * Oauth Authorization Code flow callback
	 */
	.get(jwtdecode(), async (req, res) => {
		logger.info('Processing callback');
		settingModel
			.query()
			.where({id: 'oidc-config'})
			.first()
			.then((settings) => validateCallback(req, settings))
			.then((token) => redirectWithJwtToken(res, token))
			.catch((err) => redirectWithError(res, err));
	});

/**
 * Executes discovery and returns the configured `openid-client` client
 *
 * @param {Setting} row
 * */
let getClient = async (row) => {
	let issuer;
	try {
		issuer = await oidc.Issuer.discover(row.meta.issuerURL);
	} catch (err) {
		throw new error.AuthError(`Discovery failed for the specified URL with message: ${err.message}`);
	}

	return new issuer.Client({
		client_id:      row.meta.clientID,
		client_secret:  row.meta.clientSecret,
		redirect_uris:  [row.meta.redirectURL],
		response_types: ['code'],
	});
};

/**
 * Generates state, nonce and authorization url.
 *
 * @param {Request} req
 * @param {Setting} row
 * @return { {String}, {String}, {String} } state, nonce and url
 * */
let getInitParams = async (req, row) => {
	let client = await getClient(row),
		state  = crypto.randomUUID(),
		nonce  = crypto.randomUUID(),
		url    = client.authorizationUrl({
			scope:    'openid email profile',
			resource: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
			state,
			nonce,
		});

	return { state, nonce, url };
};

/**
 * Parses state and nonce from cookie during the callback phase.
 *
 * @param {Request} req
 * @return { {String}, {String} } state and nonce
 * */
let parseStateFromCookie = (req) => {
	let state, nonce;
	let cookies = req.headers.cookie.split(';');
	for (let cookie of cookies) {
		if (cookie.split('=')[0].trim() === 'npm_oidc') {
			let raw = cookie.split('=')[1],
				val = raw.split('--');
			state   = val[0].trim();
			nonce   = val[1].trim();
			break;
		}
	}

	return { state, nonce };
};

/**
 * Executes validation of callback parameters.
 *
 * @param {Request} req
 * @param {Setting} settings
 * @return {Promise} a promise resolving to a jwt token
 * */
let validateCallback = async (req, settings) => {
	let client 	         = await getClient(settings);
	let { state, nonce } = parseStateFromCookie(req);

	const params   = client.callbackParams(req);
	const tokenSet = await client.callback(settings.meta.redirectURL, params, { state, nonce });
	let claims     = tokenSet.claims();

	if (!claims.email) {
		throw new error.AuthError('The Identity Provider didn\'t send the \'email\' claim');
	} else {
		logger.info('Successful authentication for email ' + claims.email);
	}

	return internalToken.getTokenFromOAuthClaim({ identity: claims.email });
};

let redirectToAuthorizationURL = (res, params) => {
	logger.info('Authorization URL: ' + params.url);
	res.cookie('npm_oidc', params.state + '--' + params.nonce);
	res.redirect(params.url);
};

let redirectWithJwtToken = (res, token) => {
	res.cookie('npm_oidc', token.token + '---' + token.expires);
	res.redirect('/login');
};

let redirectWithError = (res, error) => {
	logger.error('Callback error: ' + error.message);
	res.cookie('npm_oidc_error', error.message);
	res.redirect('/login');
};

module.exports = router;
