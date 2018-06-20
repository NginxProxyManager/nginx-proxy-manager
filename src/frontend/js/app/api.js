'use strict';

const $      = require('jquery');
const _      = require('underscore');
const Tokens = require('./tokens');

/**
 * @param {String}  message
 * @param {*}       debug
 * @param {Integer} code
 * @constructor
 */
const ApiError = function (message, debug, code) {
    let temp  = Error.call(this, message);
    temp.name = this.name = 'ApiError';
    this.stack   = temp.stack;
    this.message = temp.message;
    this.debug   = debug;
    this.code    = code;
};

ApiError.prototype = Object.create(Error.prototype, {
    constructor: {
        value:        ApiError,
        writable:     true,
        configurable: true
    }
});

/**
 *
 * @param   {String} verb
 * @param   {String} path
 * @param   {Object} [data]
 * @param   {Object} [options]
 * @returns {Promise}
 */
function fetch (verb, path, data, options) {
    options = options || {};

    return new Promise(function (resolve, reject) {
        let api_url = '/api/';
        let url     = api_url + path;
        let token   = Tokens.getTopToken();

        $.ajax({
            url:         url,
            data:        typeof data === 'object' ? JSON.stringify(data) : data,
            type:        verb,
            dataType:    'json',
            contentType: 'application/json; charset=UTF-8',
            crossDomain: true,
            timeout:     (options.timeout ? options.timeout : 15000),
            xhrFields:   {
                withCredentials: true
            },

            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + (token ? token.t : null));
            },

            success: function (data, textStatus, response) {
                let total = response.getResponseHeader('X-Dataset-Total');
                if (total !== null) {
                    resolve({
                        data:       data,
                        pagination: {
                            total:  parseInt(total, 10),
                            offset: parseInt(response.getResponseHeader('X-Dataset-Offset'), 10),
                            limit:  parseInt(response.getResponseHeader('X-Dataset-Limit'), 10)
                        }
                    });
                } else {
                    resolve(response);
                }
            },

            error: function (xhr, status, error_thrown) {
                let code = 400;

                if (typeof xhr.responseJSON !== 'undefined' && typeof xhr.responseJSON.error !== 'undefined' && typeof xhr.responseJSON.error.message !== 'undefined') {
                    error_thrown = xhr.responseJSON.error.message;
                    code         = xhr.responseJSON.error.code || 500;
                }

                reject(new ApiError(error_thrown, xhr.responseText, code));
            }
        });
    });
}

/**
 *
 * @param {Array} expand
 * @returns {String}
 */
function makeExpansionString (expand) {
    let items = [];
    _.forEach(expand, function (exp) {
        items.push(encodeURIComponent(exp));
    });

    return items.join(',');
}

module.exports = {
    status: function () {
        return fetch('get', '');
    },

    Tokens: {

        /**
         * @param   {String}  identity
         * @param   {String}  secret
         * @param   {Boolean} [wipe]       Will wipe the stack before adding to it again if login was successful
         * @returns {Promise}
         */
        login: function (identity, secret, wipe) {
            return fetch('post', 'tokens', {identity: identity, secret: secret})
                .then(response => {
                    if (response.token) {
                        if (wipe) {
                            Tokens.clearTokens();
                        }

                        // Set storage token
                        Tokens.addToken(response.token);
                        return response.token;
                    } else {
                        Tokens.clearTokens();
                        throw(new Error('No token returned'));
                    }
                });
        },

        /**
         * @returns {Promise}
         */
        refresh: function () {
            return fetch('get', 'tokens')
                .then(response => {
                    if (response.token) {
                        Tokens.setCurrentToken(response.token);
                        return response.token;
                    } else {
                        Tokens.clearTokens();
                        throw(new Error('No token returned'));
                    }
                });
        }
    },

    Users: {

        /**
         * @param   {Integer|String}  user_id
         * @param   {Array}           [expand]
         * @returns {Promise}
         */
        getById: function (user_id, expand) {
            return fetch('get', 'users/' + user_id + (typeof expand === 'object' && expand.length ? '?expand=' + makeExpansionString(expand) : ''));
        },

        /**
         * @param   {Array}    [expand]
         * @param   {String}   [query]
         * @returns {Promise}
         */
        getAll: function (expand, query) {
            let params = [];

            if (typeof expand === 'object' && expand !== null && expand.length) {
                params.push('expand=' + makeExpansionString(expand));
            }

            if (typeof query === 'string') {
                params.push('query=' + query);
            }

            return fetch('get', 'users' + (params.length ? '?' + params.join('&') : ''));
        },

        /**
         * @param   {Object}  data
         * @returns {Promise}
         */
        create: function (data) {
            return fetch('post', 'users', data);
        },

        /**
         * @param   {Object}   data
         * @param   {Integer}  data.id
         * @returns {Promise}
         */
        update: function (data) {
            let id = data.id;
            delete data.id;
            return fetch('put', 'users/' + id, data);
        },

        /**
         * @param   {Integer}  id
         * @returns {Promise}
         */
        delete: function (id) {
            return fetch('delete', 'users/' + id);
        },

        /**
         *
         * @param   {Integer}  id
         * @param   {Object}   auth
         * @returns {Promise}
         */
        setPassword: function (id, auth) {
            return fetch('put', 'users/' + id + '/auth', auth);
        },

        /**
         * @param   {Integer}  id
         * @returns {Promise}
         */
        loginAs: function (id) {
            return fetch('post', 'users/' + id + '/login');
        }
    }
};
