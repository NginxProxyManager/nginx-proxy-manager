'use strict';

const _                = require('lodash');
const error            = require('../lib/error');
const certificateModel = require('../models/certificate');
const internalAuditLog = require('./audit-log');
const internalHost     = require('./host');

function omissions () {
    return ['is_deleted'];
}

const internalCertificate = {

    /**
     * @param   {Access}  access
     * @param   {Object}  data
     * @returns {Promise}
     */
    create: (access, data) => {
        return access.can('certificates:create', data)
            .then(() => {
                data.owner_user_id = access.token.get('attrs').id;

                return certificateModel
                    .query()
                    .omit(omissions())
                    .insertAndFetch(data);
            })
            .then(row => {
                data.meta = _.assign({}, data.meta || {}, row.meta);

                // Add to audit log
                return internalAuditLog.add(access, {
                    action:      'created',
                    object_type: 'certificate',
                    object_id:   row.id,
                    meta:        data
                })
                    .then(() => {
                        return row;
                    });
            });
    },

    /**
     * @param  {Access}  access
     * @param  {Object}  data
     * @param  {Integer} data.id
     * @param  {String}  [data.email]
     * @param  {String}  [data.name]
     * @return {Promise}
     */
    update: (access, data) => {
        return access.can('certificates:update', data.id)
            .then(access_data => {
                // TODO
                return {};
            });
    },

    /**
     * @param  {Access}   access
     * @param  {Object}   data
     * @param  {Integer}  data.id
     * @param  {Array}    [data.expand]
     * @param  {Array}    [data.omit]
     * @return {Promise}
     */
    get: (access, data) => {
        if (typeof data === 'undefined') {
            data = {};
        }

        if (typeof data.id === 'undefined' || !data.id) {
            data.id = access.token.get('attrs').id;
        }

        return access.can('certificates:get', data.id)
            .then(access_data => {
                let query = certificateModel
                    .query()
                    .where('is_deleted', 0)
                    .andWhere('id', data.id)
                    .allowEager('[owner]')
                    .first();

                if (access_data.permission_visibility !== 'all') {
                    query.andWhere('owner_user_id', access.token.get('attrs').id);
                }

                // Custom omissions
                if (typeof data.omit !== 'undefined' && data.omit !== null) {
                    query.omit(data.omit);
                }

                if (typeof data.expand !== 'undefined' && data.expand !== null) {
                    query.eager('[' + data.expand.join(', ') + ']');
                }

                return query;
            })
            .then(row => {
                if (row) {
                    return _.omit(row, omissions());
                } else {
                    throw new error.ItemNotFoundError(data.id);
                }
            });
    },

    /**
     * @param   {Access}  access
     * @param   {Object}  data
     * @param   {Integer} data.id
     * @param   {String}  [data.reason]
     * @returns {Promise}
     */
    delete: (access, data) => {
        return access.can('certificates:delete', data.id)
            .then(() => {
                return internalCertificate.get(access, {id: data.id});
            })
            .then(row => {
                if (!row) {
                    throw new error.ItemNotFoundError(data.id);
                }

                return certificateModel
                    .query()
                    .where('id', row.id)
                    .patch({
                        is_deleted: 1
                    });
            })
            .then(() => {
                return true;
            });
    },

    /**
     * All Lists
     *
     * @param   {Access}  access
     * @param   {Array}   [expand]
     * @param   {String}  [search_query]
     * @returns {Promise}
     */
    getAll: (access, expand, search_query) => {
        return access.can('certificates:list')
            .then(access_data => {
                let query = certificateModel
                    .query()
                    .where('is_deleted', 0)
                    .groupBy('id')
                    .omit(['is_deleted'])
                    .allowEager('[owner]')
                    .orderBy('nice_name', 'ASC');

                if (access_data.permission_visibility !== 'all') {
                    query.andWhere('owner_user_id', access.token.get('attrs').id);
                }

                // Query is used for searching
                if (typeof search_query === 'string') {
                    query.where(function () {
                        this.where('name', 'like', '%' + search_query + '%');
                    });
                }

                if (typeof expand !== 'undefined' && expand !== null) {
                    query.eager('[' + expand.join(', ') + ']');
                }

                return query;
            });
    },

    /**
     * Report use
     *
     * @param   {Integer} user_id
     * @param   {String}  visibility
     * @returns {Promise}
     */
    getCount: (user_id, visibility) => {
        let query = certificateModel
            .query()
            .count('id as count')
            .where('is_deleted', 0);

        if (visibility !== 'all') {
            query.andWhere('owner_user_id', user_id);
        }

        return query.first()
            .then(row => {
                return parseInt(row.count, 10);
            });
    },

    /**
     * Validates that the certs provided are good
     *
     * @param   {Access}  access
     * @param   {Object}  data
     * @param   {Object}  data.files
     * @returns {Promise}
     */
    validate: (access, data) => {
        return new Promise((resolve, reject) => {
            let files = {};
            _.map(data.files, (file, name) => {
                if (internalHost.allowed_ssl_files.indexOf(name) !== -1) {
                    files[name] = file.data.toString();
                }
            });

            resolve(files);
        })
            .then(files => {

                // TODO: validate using openssl
                // files.certificate
                // files.certificate_key

                return true;
            });
    },

    /**
     * @param   {Access}  access
     * @param   {Object}  data
     * @param   {Integer} data.id
     * @param   {Object}  data.files
     * @returns {Promise}
     */
    upload: (access, data) => {
        return internalCertificate.get(access, {id: data.id})
            .then(row => {
                if (row.provider !== 'other') {
                    throw new error.ValidationError('Cannot upload certificates for this type of provider');
                }

                _.map(data.files, (file, name) => {
                    if (internalHost.allowed_ssl_files.indexOf(name) !== -1) {
                        row.meta[name] = file.data.toString();
                    }
                });

                return internalCertificate.update(access, {
                    id:   data.id,
                    meta: row.meta
                });
            })
            .then(row => {
                return internalAuditLog.add(access, {
                    action:      'updated',
                    object_type: 'certificate',
                    object_id:   row.id,
                    meta:        data
                })
                    .then(() => {
                        return _.pick(row.meta, internalHost.allowed_ssl_files);
                    });
            });
    }
};

module.exports = internalCertificate;
