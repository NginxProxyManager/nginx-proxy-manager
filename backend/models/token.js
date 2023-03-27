/**
 NOTE: This is not a database table, this is a model of a Token object that can be created/loaded
 and then has abilities after that.
 */

const _      = require('lodash');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../lib/config');
const error  = require('../lib/error');
const logger = require('../logger').global;
const ALGO   = 'RS256';

module.exports = function () {

	let token_data = {};

	const self = {
		/**
		 * @param {Object}  payload
		 * @returns {Promise}
		 */
		create: (payload) => {
			if (!config.getPrivateKey()) {
				logger.error('Private key is empty!');
			}
			// sign with RSA SHA256
			const options = {
				algorithm: ALGO,
				expiresIn: payload.expiresIn || '1d'
			};

			payload.jti = crypto.randomBytes(12)
				.toString('base64')
				.substring(-8);

			return new Promise((resolve, reject) => {
				jwt.sign(payload, config.getPrivateKey(), options, (err, token) => {
					if (err) {
						reject(err);
					} else {
						token_data = payload;
						resolve({
							token:   token,
							payload: payload
						});
					}
				});
			});
		},

		/**
		 * @param {String} token
		 * @returns {Promise}
		 */
		load: function (token) {
			if (!config.getPublicKey()) {
				logger.error('Public key is empty!');
			}
			return new Promise((resolve, reject) => {
				try {
					if (!token || token === null || token === 'null') {
						reject(new error.AuthError('Empty token'));
					} else {
						jwt.verify(token, config.getPublicKey(), {ignoreExpiration: false, algorithms: [ALGO]}, (err, result) => {
							if (err) {

								if (err.name === 'TokenExpiredError') {
									reject(new error.AuthError('Token has expired', err));
								} else {
									reject(err);
								}

							} else {
								token_data = result;

								// Hack: some tokens out in the wild have a scope of 'all' instead of 'user'.
								// For 30 days at least, we need to replace 'all' with user.
								if ((typeof token_data.scope !== 'undefined' && _.indexOf(token_data.scope, 'all') !== -1)) {
									token_data.scope = ['user'];
								}

								resolve(token_data);
							}
						});
					}
				} catch (err) {
					reject(err);
				}
			});

		},

		/**
		 * Does the token have the specified scope?
		 *
		 * @param   {String}  scope
		 * @returns {Boolean}
		 */
		hasScope: function (scope) {
			return typeof token_data.scope !== 'undefined' && _.indexOf(token_data.scope, scope) !== -1;
		},

		/**
		 * @param  {String}  key
		 * @return {*}
		 */
		get: function (key) {
			if (typeof token_data[key] !== 'undefined') {
				return token_data[key];
			}

			return null;
		},

		/**
		 * @param  {String}  key
		 * @param  {*}       value
		 */
		set: function (key, value) {
			token_data[key] = value;
		},

		/**
		 * @param   [default_value]
		 * @returns {Integer}
		 */
		getUserId: (default_value) => {
			const attrs = self.get('attrs');
			if (attrs && typeof attrs.id !== 'undefined' && attrs.id) {
				return attrs.id;
			}

			return default_value || 0;
		}
	};

	return self;
};
