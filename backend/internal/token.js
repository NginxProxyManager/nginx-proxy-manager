const _          = require('lodash');
const error      = require('../lib/error');
const userModel  = require('../models/user');
const authModel  = require('../models/auth');
const helpers    = require('../lib/helpers');
const TokenModel = require('../models/token');
const mfa        = require('../internal/mfa'); // <-- added MFA import

const ERROR_MESSAGE_INVALID_AUTH = 'Invalid email or password';

module.exports = {

	/**
	 * @param   {Object} data
	 * @param   {String} data.identity
	 * @param   {String} data.secret
	 * @param   {String} [data.scope]
	 * @param   {String} [data.expiry]
	 * @param   {String} [issuer]
	 * @returns {Promise}
	 */
	getTokenFromEmail: (data, issuer) => {
		let Token = new TokenModel();

		console.log(data);

		data.scope  = data.scope || 'user';
		data.expiry = data.expiry || '1d';

		return userModel
			.query()
			.where('email', data.identity.toLowerCase().trim())
			.andWhere('is_deleted', 0)
			.andWhere('is_disabled', 0)
			.first()
			.then((user) => {
				if (user) {
					// Get auth
					return authModel
						.query()
						.where('user_id', '=', user.id)
						.where('type', '=', 'password')
						.first()
						.then((auth) => {
							if (auth) {
								return auth.verifyPassword(data.secret)
									.then(async (valid) => {
										if (valid) {
											if (data.scope !== 'user' && _.indexOf(user.roles, data.scope) === -1) {
												throw new error.AuthError('Invalid scope: ' + data.scope);
											}
											return await mfa.isMfaEnabledForUser(user.id)
												.then((mfaEnabled) => {
													if (mfaEnabled) {
														if (!data.mfa_token) {
															throw new error.AuthError('MFA token required');
														}
														console.log(data.mfa_token);
														return mfa.validateMfaTokenForUser(user.id, data.mfa_token)
															.then((mfaValid) => {
																if (!mfaValid) {
																	throw new error.AuthError('Invalid MFA token');
																}
																// Create a moment of the expiry expression
																let expiry = helpers.parseDatePeriod(data.expiry);
																if (expiry === null) {
																	throw new error.AuthError('Invalid expiry time: ' + data.expiry);
																}

																return Token.create({
																	iss:   issuer || 'api',
																	attrs: {
																		id: user.id
																	},
																	scope:     [data.scope],
																	expiresIn: data.expiry
																})
																	.then((signed) => {
																		return {
																			token:   signed.token,
																			expires: expiry.toISOString()
																		};
																	});
															});
													} else {
														// Create a moment of the expiry expression
														let expiry = helpers.parseDatePeriod(data.expiry);
														if (expiry === null) {
															throw new error.AuthError('Invalid expiry time: ' + data.expiry);
														}

														return Token.create({
															iss:   issuer || 'api',
															attrs: {
																id: user.id
															},
															scope:     [data.scope],
															expiresIn: data.expiry
														})
															.then((signed) => {
																return {
																	token:   signed.token,
																	expires: expiry.toISOString()
																};
															});
													}
												});
										} else {
											throw new error.AuthError(ERROR_MESSAGE_INVALID_AUTH);
										}
									});
							} else {
								throw new error.AuthError(ERROR_MESSAGE_INVALID_AUTH);
							}
						});
				} else {
					throw new error.AuthError(ERROR_MESSAGE_INVALID_AUTH);
				}
			});
	},

	/**
	 * @param {Access} access
	 * @param {Object} [data]
	 * @param {String} [data.expiry]
	 * @param {String} [data.scope]   Only considered if existing token scope is admin
	 * @returns {Promise}
	 */
	getFreshToken: (access, data) => {
		let Token = new TokenModel();

		data        = data || {};
		data.expiry = data.expiry || '1d';

		if (access && access.token.getUserId(0)) {

			// Create a moment of the expiry expression
			let expiry = helpers.parseDatePeriod(data.expiry);
			if (expiry === null) {
				throw new error.AuthError('Invalid expiry time: ' + data.expiry);
			}

			let token_attrs = {
				id: access.token.getUserId(0)
			};

			// Only admins can request otherwise scoped tokens
			let scope = access.token.get('scope');
			if (data.scope && access.token.hasScope('admin')) {
				scope = [data.scope];

				if (data.scope === 'job-board' || data.scope === 'worker') {
					token_attrs.id = 0;
				}
			}

			return Token.create({
				iss:       'api',
				scope:     scope,
				attrs:     token_attrs,
				expiresIn: data.expiry
			})
				.then((signed) => {
					return {
						token:   signed.token,
						expires: expiry.toISOString()
					};
				});
		} else {
			throw new error.AssertionFailedError('Existing token contained invalid user data');
		}
	},

	/**
	 * @param   {Object} user
	 * @returns {Promise}
	 */
	getTokenFromUser: (user) => {
		const expire = '1d';
		const Token  = new TokenModel();
		const expiry = helpers.parseDatePeriod(expire);

		return Token.create({
			iss:   'api',
			attrs: {
				id: user.id
			},
			scope:     ['user'],
			expiresIn: expire
		})
			.then((signed) => {
				return {
					token:   signed.token,
					expires: expiry.toISOString(),
					user:    user
				};
			});
	}
};
