'use strict';

import $ from 'jquery';

/**
 * @param {String} message
 * @param {*}      debug
 * @param {Number} code
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
 * @param {String} verb
 * @param {String} path
 * @param {Object} [data]
 * @param {Object} [options]
 * @returns {Promise}
 */
function fetch (verb, path, data, options) {
    options = options || {};

    return new Promise(function (resolve, reject) {
        let api_url = '/api/';
        let url     = api_url + path;

        $.ajax({
            url:         url,
            data:        typeof data === 'object' && data !== null ? JSON.stringify(data) : data,
            type:        verb,
            dataType:    'json',
            contentType: 'application/json; charset=UTF-8',
            crossDomain: true,
            timeout:     (options.timeout ? options.timeout : 30000),
            xhrFields:   {
                withCredentials: true
            },

            success: function (data, textStatus, response) {
                resolve(response);
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

module.exports = {
    status: function () {
        return fetch('get', '');
    },

    Hosts: {

        /**
         * @returns {Promise}
         */
        getAll: function () {
            return fetch('get', 'hosts');
        },

        /**
         * @param   {Object}  data
         * @returns {Promise}
         */
        create: function (data) {
            return fetch('post', 'hosts', data);
        },

        /**
         * @param   {Object}   data
         * @param   {String}   data._id
         * @returns {Promise}
         */
        update: function (data) {
            let _id = data._id;
            delete data._id;
            return fetch('put', 'hosts/' + _id, data);
        },

        /**
         * @param   {String}  _id
         * @returns {Promise}
         */
        delete: function (_id) {
            return fetch('delete', 'hosts/' + _id);
        },

        /**
         * @param   {String}  _id
         * @returns {Promise}
         */
        reconfigure: function (_id) {
            return fetch('post', 'hosts/' + _id + '/reconfigure');
        },

        /**
         * @param   {String}  _id
         * @returns {Promise}
         */
        renew: function (_id) {
            return fetch('post', 'hosts/' + _id + '/renew');
        }
    },

    Access: {

        /**
         * @returns {Promise}
         */
        getAll: function () {
            return fetch('get', 'access');
        },

        /**
         * @param   {Object}  data
         * @returns {Promise}
         */
        create: function (data) {
            return fetch('post', 'access', data);
        },

        /**
         * @param   {Object}   data
         * @param   {String}   data._id
         * @returns {Promise}
         */
        update: function (data) {
            let _id = data._id;
            delete data._id;
            return fetch('put', 'access/' + _id, data);
        },

        /**
         * @param   {String}  _id
         * @returns {Promise}
         */
        delete: function (_id) {
            return fetch('delete', 'access/' + _id);
        }
    }
};
