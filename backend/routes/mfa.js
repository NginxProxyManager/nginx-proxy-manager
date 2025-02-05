const express       = require('express');
const jwtdecode     = require('../lib/express/jwt-decode');
const apiValidator  = require('../lib/validator/api');
const internalToken = require('../internal/token');
const schema        = require('../schema');
const internalMfa   = require('../internal/mfa');
const qrcode        = require('qrcode');
const speakeasy     = require('speakeasy');
const userModel     = require('../models/user');

let router = express.Router({
	caseSensitive: true,
	strict:        true,
	mergeParams:   true
});

router
	.route('/')
	.options((_, res) => {
		res.sendStatus(204);
	})

	.get(async (req, res, next) => {
		internalToken.getFreshToken(res.locals.access, {
			expiry: (typeof req.query.expiry !== 'undefined' ? req.query.expiry : null),
			scope:  (typeof req.query.scope !== 'undefined' ? req.query.scope : null)
		})
			.then((data) => {
				res.status(200)
					.send(data);
			})
			.catch(next);
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
					label:  user.email,
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
		apiValidator(schema.getValidationSchema('/mfa', 'post'), req.body).then((params) => {
			internalMfa.enableMfaForUser(res.locals.access.token.getUserId(), params.token)
				.then(() => res.status(200).send({ success: true }))
				.catch(next);
		}
		);});

router
	.route('/check')
	.get(jwtdecode(), (req, res, next) => {
		internalMfa.isMfaEnabledForUser(res.locals.access.token.getUserId())
			.then((active) => res.status(200).send({ active }))
			.catch(next);
	});

module.exports = router;
