/**
 NOTE: This is not a database table, this is a model of a Token object that can be created/loaded
 and then has abilities after that.
 */

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import _ from "lodash";
import { getPrivateKey, getPublicKey } from "../lib/config.js";
import errs from "../lib/error.js";
import { global as logger } from "../logger.js";

const ALGO = "RS256";

export default () => {
	let token_data = {};

	const self = {
		/**
		 * @param {Object}  payload
		 * @returns {Promise}
		 */
		create: (payload) => {
			if (!getPrivateKey()) {
				logger.error("Private key is empty!");
			}
			// sign with RSA SHA256
			const options = {
				algorithm: ALGO,
				expiresIn: payload.expiresIn || "1d",
			};

			payload.jti = crypto.randomBytes(12).toString("base64").substring(-8);

			return new Promise((resolve, reject) => {
				jwt.sign(payload, getPrivateKey(), options, (err, token) => {
					if (err) {
						reject(err);
					} else {
						token_data = payload;
						resolve({
							token: token,
							payload: payload,
						});
					}
				});
			});
		},

		/**
		 * @param {String} token
		 * @returns {Promise}
		 */
		load: (token) => {
			if (!getPublicKey()) {
				logger.error("Public key is empty!");
			}
			return new Promise((resolve, reject) => {
				try {
					if (!token || token === null || token === "null") {
						reject(new errs.AuthError("Empty token"));
					} else {
						jwt.verify(
							token,
							getPublicKey(),
							{ ignoreExpiration: false, algorithms: [ALGO] },
							(err, result) => {
								if (err) {
									if (err.name === "TokenExpiredError") {
										reject(new errs.AuthError("Token has expired", err));
									} else {
										reject(err);
									}
								} else {
									token_data = result;

									// Hack: some tokens out in the wild have a scope of 'all' instead of 'user'.
									// For 30 days at least, we need to replace 'all' with user.
									if (
										typeof token_data.scope !== "undefined" &&
										_.indexOf(token_data.scope, "all") !== -1
									) {
										token_data.scope = ["user"];
									}

									resolve(token_data);
								}
							},
						);
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
		hasScope: (scope) => typeof token_data.scope !== "undefined" && _.indexOf(token_data.scope, scope) !== -1,

		/**
		 * @param  {String}  key
		 * @return {*}
		 */
		get: (key) => {
			if (typeof token_data[key] !== "undefined") {
				return token_data[key];
			}

			return null;
		},

		/**
		 * @param  {String}  key
		 * @param  {*}       value
		 */
		set: (key, value) => {
			token_data[key] = value;
		},

		/**
		 * @param   [default_value]
		 * @returns {Integer}
		 */
		getUserId: (default_value) => {
			const attrs = self.get("attrs");
			if (attrs && typeof attrs.id !== "undefined" && attrs.id) {
				return attrs.id;
			}

			return default_value || 0;
		},
	};

	return self;
};
