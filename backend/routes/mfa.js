const express = require('express');
const jwtdecode = require('../lib/express/jwt-decode');
const apiValidator = require('../lib/validator/api');
const schema = require('../schema');
const internalMfa = require('../internal/mfa');
const qrcode = require('qrcode');
const speakeasy = require('speakeasy');
const userModel = require('../models/user');

let router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true
});

router
	.route('/create')
	.post(jwtdecode(), (req, res, next) => {
		if (!res.locals.access) {
			return next(new Error('Invalid token'));
		}
		const userId = res.locals.access.token.getUserId();
		internalMfa.createMfaSecretForUser(userId)
			.then((secret) => {
				return userModel.query()
					.where('id', '=', userId)
					.first()
					.then((user) => {
						if (!user) {
							return next(new Error('User not found'));
						}
						return { secret, user };
					});
			})
			.then(({ secret, user }) => {
				const otpAuthUrl = speakeasy.otpauthURL({
					secret: secret.ascii,
					label: user.email,
					issuer: 'Nginx Proxy Manager'
				});
				qrcode.toDataURL(otpAuthUrl, (err, dataUrl) => {
					if (err) {
						console.error('Error generating QR code:', err);
						return next(err);
					}
					res.status(200).send({ qrCode: dataUrl });
				});
			})
			.catch(next);
	});

router
	.route('/enable')
	.post(jwtdecode(), (req, res, next) => {
		apiValidator(schema.getValidationSchema('/mfa/enable', 'post'), req.body).then((params) => {
			internalMfa.enableMfaForUser(res.locals.access.token.getUserId(), params.token)
				.then(() => res.status(200).send({ success: true }))
				.catch(next);
		}
		).catch(next);
	});

router
	.route('/check')
	.get(jwtdecode(), (req, res, next) => {
		internalMfa.isMfaEnabledForUser(res.locals.access.token.getUserId())
			.then((active) => res.status(200).send({ active }))
			.catch(next);
	});

router
	.route('/delete')
	.delete(jwtdecode(), (req, res, next) => {
		apiValidator(schema.getValidationSchema('/mfa/delete', 'delete'), req.body).then((params) => {
			internalMfa.disableMfaForUser(params, res.locals.access.token.getUserId())
				.then(() => res.status(200).send({ success: true }))
				.catch(next);
		}).catch(next);
	});

module.exports = router;
