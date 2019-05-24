const $      = require('jquery');
const _      = require('underscore');
const Tokens = require('./tokens');

/**
 * @param {String}  message
 * @param {*}       debug
 * @param {Number} code
 * @constructor
 */
const ApiError = function (message, debug, code) {
    let temp     = Error.call(this, message);
    temp.name    = this.name = 'ApiError';
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
function fetch(verb, path, data, options) {
    options = options || {};

    return new Promise(function (resolve, reject) {
        let api_url = '/api/';
        let url     = api_url + path;
        let token   = Tokens.getTopToken();

        if ((typeof options.contentType === 'undefined' || options.contentType.match(/json/im)) && typeof data === 'object') {
            data = JSON.stringify(data);
        }

        $.ajax({
            url:         url,
            data:        typeof data === 'object' ? JSON.stringify(data) : data,
            type:        verb,
            dataType:    'json',
            contentType: options.contentType || 'application/json; charset=UTF-8',
            processData: options.processData || true,
            crossDomain: true,
            timeout:     options.timeout ? options.timeout : 30000,
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
function makeExpansionString(expand) {
    let items = [];
    _.forEach(expand, function (exp) {
        items.push(encodeURIComponent(exp));
    });

    return items.join(',');
}

/**
 * @param   {String}   path
 * @param   {Array}    [expand]
 * @param   {String}   [query]
 * @returns {Promise}
 */
function getAllObjects(path, expand, query) {
    let params = [];

    if (typeof expand === 'object' && expand !== null && expand.length) {
        params.push('expand=' + makeExpansionString(expand));
    }

    if (typeof query === 'string') {
        params.push('query=' + query);
    }

    return fetch('get', path + (params.length ? '?' + params.join('&') : ''));
}

function FileUpload(path, fd) {
    return new Promise((resolve, reject) => {
        let xhr   = new XMLHttpRequest();
        let token = Tokens.getTopToken();

        xhr.open('POST', '/api/' + path);
        xhr.overrideMimeType('text/plain');
        xhr.setRequestHeader('Authorization', 'Bearer ' + (token ? token.t : null));
        xhr.send(fd);

        xhr.onreadystatechange = function () {
            if (this.readyState === XMLHttpRequest.DONE) {
                if (xhr.status !== 200 && xhr.status !== 201) {
                    reject(new Error('Upload failed: ' + xhr.status));
                } else {
                    resolve(xhr.responseText);
                }
            }
        };
    });
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
         * @param   {Number|String}  user_id
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
            return getAllObjects('users', expand, query);
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
         * @param   {Number}   data.id
         * @returns {Promise}
         */
        update: function (data) {
            let id = data.id;
            delete data.id;
            return fetch('put', 'users/' + id, data);
        },

        /**
         * @param   {Number}  id
         * @returns {Promise}
         */
        delete: function (id) {
            return fetch('delete', 'users/' + id);
        },

        /**
         *
         * @param   {Number}   id
         * @param   {Object}   auth
         * @returns {Promise}
         */
        setPassword: function (id, auth) {
            return fetch('put', 'users/' + id + '/auth', auth);
        },

        /**
         * @param   {Number}  id
         * @returns {Promise}
         */
        loginAs: function (id) {
            return fetch('post', 'users/' + id + '/login');
        },

        /**
         *
         * @param   {Number}   id
         * @param   {Object}   perms
         * @returns {Promise}
         */
        setPermissions: function (id, perms) {
            return fetch('put', 'users/' + id + '/permissions', perms);
        }
    },

    Nginx: {

        ProxyHosts: {
            /**
             * @param   {Array}    [expand]
             * @param   {String}   [query]
             * @returns {Promise}
             */
            getAll: function (expand, query) {
                return getAllObjects('nginx/proxy-hosts', expand, query);
            },

            /**
             * @param {Object}  data
             */
            create: function (data) {
                return fetch('post', 'nginx/proxy-hosts', data);
            },

            /**
             * @param   {Object}   data
             * @param   {Number}  data.id
             * @returns {Promise}
             */
            update: function (data) {
                let id = data.id;
                delete data.id;
                return fetch('put', 'nginx/proxy-hosts/' + id, data);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            delete: function (id) {
                return fetch('delete', 'nginx/proxy-hosts/' + id);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            get: function (id) {
                return fetch('get', 'nginx/proxy-hosts/' + id);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            enable: function (id) {
                return fetch('post', 'nginx/proxy-hosts/' + id + '/enable');
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            disable: function (id) {
                return fetch('post', 'nginx/proxy-hosts/' + id + '/disable');
            }
        },

        RedirectionHosts: {
            /**
             * @param   {Array}    [expand]
             * @param   {String}   [query]
             * @returns {Promise}
             */
            getAll: function (expand, query) {
                return getAllObjects('nginx/redirection-hosts', expand, query);
            },

            /**
             * @param {Object}  data
             */
            create: function (data) {
                return fetch('post', 'nginx/redirection-hosts', data);
            },

            /**
             * @param   {Object}   data
             * @param   {Number}   data.id
             * @returns {Promise}
             */
            update: function (data) {
                let id = data.id;
                delete data.id;
                return fetch('put', 'nginx/redirection-hosts/' + id, data);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            delete: function (id) {
                return fetch('delete', 'nginx/redirection-hosts/' + id);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            get: function (id) {
                return fetch('get', 'nginx/redirection-hosts/' + id);
            },

            /**
             * @param  {Number}   id
             * @param  {FormData} form_data
             * @params {Promise}
             */
            setCerts: function (id, form_data) {
                return FileUpload('nginx/redirection-hosts/' + id + '/certificates', form_data);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            enable: function (id) {
                return fetch('post', 'nginx/redirection-hosts/' + id + '/enable');
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            disable: function (id) {
                return fetch('post', 'nginx/redirection-hosts/' + id + '/disable');
            }
        },

        Streams: {
            /**
             * @param   {Array}    [expand]
             * @param   {String}   [query]
             * @returns {Promise}
             */
            getAll: function (expand, query) {
                return getAllObjects('nginx/streams', expand, query);
            },

            /**
             * @param {Object}  data
             */
            create: function (data) {
                return fetch('post', 'nginx/streams', data);
            },

            /**
             * @param   {Object}   data
             * @param   {Number}   data.id
             * @returns {Promise}
             */
            update: function (data) {
                let id = data.id;
                delete data.id;
                return fetch('put', 'nginx/streams/' + id, data);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            delete: function (id) {
                return fetch('delete', 'nginx/streams/' + id);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            get: function (id) {
                return fetch('get', 'nginx/streams/' + id);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            enable: function (id) {
                return fetch('post', 'nginx/streams/' + id + '/enable');
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            disable: function (id) {
                return fetch('post', 'nginx/streams/' + id + '/disable');
            }
        },

        DeadHosts: {
            /**
             * @param   {Array}    [expand]
             * @param   {String}   [query]
             * @returns {Promise}
             */
            getAll: function (expand, query) {
                return getAllObjects('nginx/dead-hosts', expand, query);
            },

            /**
             * @param {Object}  data
             */
            create: function (data) {
                return fetch('post', 'nginx/dead-hosts', data);
            },

            /**
             * @param   {Object}   data
             * @param   {Number}   data.id
             * @returns {Promise}
             */
            update: function (data) {
                let id = data.id;
                delete data.id;
                return fetch('put', 'nginx/dead-hosts/' + id, data);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            delete: function (id) {
                return fetch('delete', 'nginx/dead-hosts/' + id);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            get: function (id) {
                return fetch('get', 'nginx/dead-hosts/' + id);
            },

            /**
             * @param  {Number}   id
             * @param  {FormData} form_data
             * @params {Promise}
             */
            setCerts: function (id, form_data) {
                return FileUpload('nginx/dead-hosts/' + id + '/certificates', form_data);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            enable: function (id) {
                return fetch('post', 'nginx/dead-hosts/' + id + '/enable');
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            disable: function (id) {
                return fetch('post', 'nginx/dead-hosts/' + id + '/disable');
            }
        },

        AccessLists: {
            /**
             * @param   {Array}    [expand]
             * @param   {String}   [query]
             * @returns {Promise}
             */
            getAll: function (expand, query) {
                return getAllObjects('nginx/access-lists', expand, query);
            },

            /**
             * @param {Object}  data
             */
            create: function (data) {
                return fetch('post', 'nginx/access-lists', data);
            },

            /**
             * @param   {Object}   data
             * @param   {Number}   data.id
             * @returns {Promise}
             */
            update: function (data) {
                let id = data.id;
                delete data.id;
                return fetch('put', 'nginx/access-lists/' + id, data);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            delete: function (id) {
                return fetch('delete', 'nginx/access-lists/' + id);
            }
        },

        Certificates: {
            /**
             * @param   {Array}    [expand]
             * @param   {String}   [query]
             * @returns {Promise}
             */
            getAll: function (expand, query) {
                return getAllObjects('nginx/certificates', expand, query);
            },

            /**
             * @param {Object}  data
             */
            create: function (data) {
                return fetch('post', 'nginx/certificates', data);
            },

            /**
             * @param   {Object}   data
             * @param   {Number}   data.id
             * @returns {Promise}
             */
            update: function (data) {
                let id = data.id;
                delete data.id;
                return fetch('put', 'nginx/certificates/' + id, data);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            delete: function (id) {
                return fetch('delete', 'nginx/certificates/' + id);
            },

            /**
             * @param  {Number}  id
             * @param  {FormData} form_data
             * @params {Promise}
             */
            upload: function (id, form_data) {
                return FileUpload('nginx/certificates/' + id + '/upload', form_data);
            },

            /**
             * @param  {FormData} form_data
             * @params {Promise}
             */
            validate: function (form_data) {
                return FileUpload('nginx/certificates/validate', form_data);
            },

            /**
             * @param   {Number}  id
             * @returns {Promise}
             */
            renew: function (id) {
                return fetch('post', 'nginx/certificates/' + id + '/renew');
            }
        }
    },

    AuditLog: {
        /**
         * @param   {Array}    [expand]
         * @param   {String}   [query]
         * @returns {Promise}
         */
        getAll: function (expand, query) {
            return getAllObjects('audit-log', expand, query);
        }
    },

    Reports: {

        /**
         * @returns {Promise}
         */
        getHostStats: function () {
            return fetch('get', 'reports/hosts');
        }
    },

    Settings: {

        /**
         * @param   {String}  setting_id
         * @returns {Promise}
         */
        getById: function (setting_id) {
            return fetch('get', 'settings/' + setting_id);
        },

        /**
         * @returns {Promise}
         */
        getAll: function () {
            return getAllObjects('settings');
        },

        /**
         * @param   {Object}   data
         * @param   {Number}   data.id
         * @returns {Promise}
         */
        update: function (data) {
            let id = data.id;
            delete data.id;
            return fetch('put', 'settings/' + id, data);
        }
    }
};
