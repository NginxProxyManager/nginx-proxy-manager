/**
 NOTE: This is not a database table, this is a model of a Token object that can be created/loaded
 and then has abilities after that.
 */

'use strict';

const _      = require('lodash');
const config = require('config');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const error  = require('../lib/error');
const ALGO   = 'RS256';

module.exports = function () {
    const public_key  = config.get('jwt.pub');
    const private_key = config.get('jwt.key');

    let token_data = {};

    return {
        /**
         * @param {Object}  payload
         * @param {Object}  [user_options]
         * @param {Integer} [user_options.expires]
         * @returns {Promise}
         */
        create: (payload, user_options) => {

            user_options = user_options || {};

            // sign with RSA SHA256
            let options = {
                algorithm: ALGO
            };

            if (typeof user_options.expires !== 'undefined' && user_options.expires) {
                options.expiresIn = user_options.expires;
            }

            payload.jti = crypto.randomBytes(12)
                .toString('base64')
                .substr(-8);

            return new Promise((resolve, reject) => {
                jwt.sign(payload, private_key, options, (err, token) => {
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
            return new Promise((resolve, reject) => {
                try {
                    if (!token || token === null || token === 'null') {
                        reject('Empty token');
                    } else {
                        jwt.verify(token, public_key, {ignoreExpiration: false, algorithms: [ALGO]}, (err, result) => {
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
                                    //console.log('Warning! Replacing "all" scope with "user"');

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
        }
    };
};
