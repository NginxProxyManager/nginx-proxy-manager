const error = require('../lib/error');
const express = require('express');
const jwtdecode = require('../lib/express/jwt-decode');
const logger = require('../logger').oidc;
const client = require('openid-client');
const settingModel = require('../models/setting');
const internalToken = require('../internal/token');

let router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
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
		settingModel
			.query()
			.where({ id: 'oidc-config' })
			.first()
			.then((settings) => getInitParams(req, settings))
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
		settingModel
			.query()
			.where({ id: 'oidc-config' })
			.first()
			.then((settings) => validateCallback(req, settings))
			.then((token) => redirectWithJwtToken(res, token))
			.catch((err) => redirectWithError(res, err));
	});

/**
 * Executes discovery and returns the configured `openid-client` client
 *
 * @param {Setting} settings
 * */
let getConfig = async (settings) => {
	return await client.discovery(new URL(settings.meta.issuerURL), settings.meta.clientID, settings.meta.clientSecret);
};

/**
 * Generates nonce, state and authorization url.
 *
 * @param {Request} req
 * @param {Setting} settings
 * @return { {String}, {String}, {String} } nonce, state and authorization url
 * */
let getInitParams = async (req, settings) => {
	let config = await getConfig(settings);

	let nonce = client.randomNonce();
	let state = client.randomState();

	let parameters = {
		redirect_uri: settings.meta.redirectURL,
		scope: 'openid email',
		nonce: nonce,
		state: state,
	};

	let url = await client.buildAuthorizationUrl(config, parameters);

	return { url, nonce, state };
};

/**
 * Parses nonce, state and from cookie during the callback phase.
 *
 * @param {Request} req
 * @return { {String}, {String} } nonce and state
 * */
let parseValuesFromCookie = (req) => {
	if (!req.headers || !req.headers.cookie) {
		return { nonce: undefined, state: undefined };
	}
	let nonce, state;
	let cookies = req.headers.cookie.split(';');
	for (let cookie of cookies) {
		if (cookie.split('=')[0].trim() === 'npmplus_oidc') {
			let raw = cookie.split('=')[1],
				val = raw.split('___');
			nonce = val[0].trim();
			state = val[1].trim();
			break;
		}
	}

	return { nonce, state };
};

/**
 * Executes validation of callback parameters.
 *
 * @param {Request} req
 * @param {Setting} settings
 * @return {Promise} a promise resolving to a jwt token
 * */
let validateCallback = async (req, settings) => {
	let config = await getConfig(settings);
	let { nonce, state } = parseValuesFromCookie(req);
	let currentUrl = new URL(`${req.protocol}://${req.get('host')}${req.originalUrl}`);
	let tokens = await client.authorizationCodeGrant(config, currentUrl, {
		expectedNonce: nonce,
		expectedState: state,
	});
	let claims = tokens.claims();

	if (!claims.email) {
		throw new error.AuthError("The Identity Provider didn't send the 'email' claim");
	} else {
		logger.info('Successful authentication for email ' + claims.email);
	}

	return internalToken.getTokenFromOAuthClaim({ identity: claims.email });
};

let redirectToAuthorizationURL = (res, params) => {
	res.cookie('npmplus_oidc', params.nonce + '___' + params.state, { secure: true, sameSite: 'Strict' });
	res.redirect(params.url);
};

let redirectWithJwtToken = (res, token) => {
	res.cookie('npmplus_oidc', token.token + '---' + token.expires, { secure: true, sameSite: 'Strict' });
	res.redirect('/login');
};

let redirectWithError = (res, error) => {
	logger.error('Callback error: ' + error.message);
	res.cookie('npmplus_oidc_error', error.message, { secure: true, sameSite: 'Strict' });
	res.redirect('/login');
};

module.exports = router;
