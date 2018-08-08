'use strict';

const _                    = require('lodash');
const error                = require('../lib/error');
const proxyHostModel       = require('../models/proxy_host');
const redirectionHostModel = require('../models/redirection_host');
const deadHostModel        = require('../models/dead_host');

const internalHost = {

    allowed_ssl_files: ['certificate', 'certificate_key', 'intermediate_certificate'],

    /**
     * Internal use only, checks to see if the domain is already taken by any other record
     *
     * @param   {String}   hostname
     * @param   {String}   [ignore_type]   'proxy', 'redirection', 'dead'
     * @param   {Integer}  [ignore_id]     Must be supplied if type was also supplied
     * @returns {Promise}
     */
    isHostnameTaken: function (hostname, ignore_type, ignore_id) {
        let promises = [
            proxyHostModel
                .query()
                .where('is_deleted', 0)
                .andWhere('domain_names', 'like', '%' + hostname + '%'),
            redirectionHostModel
                .query()
                .where('is_deleted', 0)
                .andWhere('domain_names', 'like', '%' + hostname + '%'),
            deadHostModel
                .query()
                .where('is_deleted', 0)
                .andWhere('domain_names', 'like', '%' + hostname + '%')
        ];

        return Promise.all(promises)
            .then(promises_results => {
                let is_taken = false;

                if (promises_results[0]) {
                    // Proxy Hosts
                    if (internalHost._checkHostnameRecordsTaken(hostname, promises_results[0], ignore_type === 'proxy' && ignore_id ? ignore_id : 0)) {
                        is_taken = true;
                    }
                }

                if (promises_results[1]) {
                    // Redirection Hosts
                    if (internalHost._checkHostnameRecordsTaken(hostname, promises_results[1], ignore_type === 'redirection' && ignore_id ? ignore_id : 0)) {
                        is_taken = true;
                    }
                }

                if (promises_results[1]) {
                    // Dead Hosts
                    if (internalHost._checkHostnameRecordsTaken(hostname, promises_results[2], ignore_type === 'dead' && ignore_id ? ignore_id : 0)) {
                        is_taken = true;
                    }
                }

                return {
                    hostname: hostname,
                    is_taken: is_taken
                };
            });
    },

    /**
     * Cleans the ssl keys from the meta object and sets them to "true"
     *
     * @param   {Object}  meta
     * @returns {*}
     */
    cleanMeta: function (meta) {
        internalHost.allowed_ssl_files.map(key => {
            if (typeof meta[key] !== 'undefined' && meta[key]) {
                meta[key] = true;
            }
        });
        return meta;
    },

    /**
     * Private call only
     *
     * @param   {String}  hostname
     * @param   {Array}   existing_rows
     * @param   {Integer} [ignore_id]
     * @returns {Boolean}
     */
    _checkHostnameRecordsTaken: function (hostname, existing_rows, ignore_id) {
        let is_taken = false;

        if (existing_rows && existing_rows.length) {
            existing_rows.map(function (existing_row) {
                existing_row.domain_names.map(function (existing_hostname) {
                    // Does this domain match?
                    if (existing_hostname.toLowerCase() === hostname.toLowerCase()) {
                        if (!ignore_id || ignore_id !== existing_row.id) {
                            is_taken = true;
                        }
                    }
                });
            });
        }

        return is_taken;
    }

};

module.exports = internalHost;
