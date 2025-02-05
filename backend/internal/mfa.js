const authModel = require('../models/auth');
const error     = require('../lib/error');
const speakeasy = require('speakeasy');

module.exports = {
	validateMfaTokenForUser: (userId, token) => {
		return authModel
			.query()
			.where('user_id', userId)
			.first()
			.then((auth) => {
				if (!auth || !auth.mfa_enabled) {
					throw new error.AuthError('MFA is not enabled for this user.');
				}
				const verified = speakeasy.totp.verify({
					secret:   auth.mfa_secret,
					encoding: 'base32',
					token:    token,
					window:   2
				});
				if (!verified) {
					throw new error.AuthError('Invalid MFA token.');
				}
				return true;
			});
	},
	isMfaEnabledForUser: (userId) => {
		return authModel
			.query()
			.where('user_id', userId)
			.first()
			.then((auth) => {
				console.log(auth);
				if (!auth) {
					throw new error.AuthError('User not found.');
				}
				return auth.mfa_enabled === true;
			});
	},
	createMfaSecretForUser: (userId) => {
		const secret = speakeasy.generateSecret({ length: 20 });
		console.log(secret);
		return authModel
			.query()
			.where('user_id', userId)
			.update({
				mfa_secret: secret.base32
			})
			.then(() => secret);
	},
	enableMfaForUser: (userId, token) => {
		return authModel
			.query()
			.where('user_id', userId)
			.first()
			.then((auth) => {
				if (!auth || !auth.mfa_secret) {
					throw new error.AuthError('MFA is not set up for this user.');
				}
				const verified = speakeasy.totp.verify({
					secret:   auth.mfa_secret,
					encoding: 'base32',
					token:    token,
					window:   2
				});
				if (!verified) {
					throw new error.AuthError('Invalid MFA token.');
				}
				return authModel
					.query()
					.where('user_id', userId)
					.update({ mfa_enabled: true })
					.then(() => true);
			});
	},
};
