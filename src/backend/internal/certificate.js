'use strict';

const fs               = require('fs');
const _                = require('lodash');
const error            = require('../lib/error');
const certificateModel = require('../models/certificate');
const internalAuditLog = require('./audit-log');
const tempWrite        = require('temp-write');
const utils            = require('../lib/utils');
const moment           = require('moment');

function omissions () {
    return ['is_deleted'];
}

const internalCertificate = {

    allowed_ssl_files: ['certificate', 'certificate_key', 'intermediate_certificate'],

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
                return internalCertificate.get(access, {id: data.id});
            })
            .then(row => {
                if (row.id !== data.id) {
                    // Sanity check that something crazy hasn't happened
                    throw new error.InternalValidationError('Certificate could not be updated, IDs do not match: ' + row.id + ' !== ' + data.id);
                }

                return certificateModel
                    .query()
                    .omit(omissions())
                    .patchAndFetchById(row.id, data)
                    .debug()
                    .then(saved_row => {
                        saved_row.meta = internalCertificate.cleanMeta(saved_row.meta);
                        data.meta      = internalCertificate.cleanMeta(data.meta);

                        // Add row.nice_name for custom certs
                        if (saved_row.provider === 'other') {
                            data.nice_name = saved_row.nice_name;
                        }

                        // Add to audit log
                        return internalAuditLog.add(access, {
                            action:      'updated',
                            object_type: 'certificate',
                            object_id:   row.id,
                            meta:        _.omit(data, ['expires_on']) // this prevents json circular reference because expires_on might be raw
                        })
                            .then(() => {
                                return _.omit(saved_row, omissions());
                            });
                    });
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
     * @param {Access}  access
     * @param {Object}  data
     * @param {Integer} data.id
     * @param {String}  [data.reason]
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
                    })
                    .then(() => {
                        // Add to audit log
                        row.meta = internalCertificate.cleanMeta(row.meta);

                        return internalAuditLog.add(access, {
                            action:      'deleted',
                            object_type: 'certificate',
                            object_id:   row.id,
                            meta:        _.omit(row, omissions())
                        });
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
     * Validates that the certs provided are good.
     * No access required here, nothing is changed or stored.
     *
     * @param   {Object}  data
     * @param   {Object}  data.files
     * @returns {Promise}
     */
    validate: data => {
        return new Promise(resolve => {
            // Put file contents into an object
            let files = {};
            _.map(data.files, (file, name) => {
                if (internalCertificate.allowed_ssl_files.indexOf(name) !== -1) {
                    files[name] = file.data.toString();
                }
            });

            resolve(files);
        })
            .then(files => {
                // For each file, create a temp file and write the contents to it
                // Then test it depending on the file type
                let promises = [];
                _.map(files, (content, type) => {
                    promises.push(new Promise((resolve, reject) => {
                        if (type === 'certificate_key') {
                            resolve(internalCertificate.checkPrivateKey(content));
                        } else {
                            // this should handle `certificate` and intermediate certificate
                            resolve(internalCertificate.getCertificateInfo(content, true));
                        }
                    }).then(res => {
                        return {[type]: res};
                    }));
                });

                return Promise.all(promises)
                    .then(files => {
                        let data = {};

                        _.each(files, file => {
                            data = _.assign({}, data, file);
                        });

                        return data;
                    });
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

                return internalCertificate.validate(data)
                    .then(validations => {
                        if (typeof validations.certificate === 'undefined') {
                            throw new error.ValidationError('Certificate file was not provided');
                        }

                        _.map(data.files, (file, name) => {
                            if (internalCertificate.allowed_ssl_files.indexOf(name) !== -1) {
                                row.meta[name] = file.data.toString();
                            }
                        });

                        return internalCertificate.update(access, {
                            id:           data.id,
                            expires_on:   certificateModel.raw('FROM_UNIXTIME(' + validations.certificate.dates.to + ')'),
                            domain_names: [validations.certificate.cn],
                            meta:         row.meta
                        });
                    })
                    .then(() => {
                        return _.pick(row.meta, internalCertificate.allowed_ssl_files);
                    });
            });
    },

    /**
     * Uses the openssl command to validate the private key.
     * It will save the file to disk first, then run commands on it, then delete the file.
     *
     * @param {String}  private_key    This is the entire key contents as a string
     */
    checkPrivateKey: private_key => {
        return tempWrite(private_key, '/tmp')
            .then(filepath => {
                return utils.exec('openssl rsa -in ' + filepath + ' -check -noout')
                    .then(result => {
                        if (!result.toLowerCase().includes('key ok')) {
                            throw new error.ValidationError(result);
                        }

                        fs.unlinkSync(filepath);
                        return true;
                    }).catch(err => {
                        fs.unlinkSync(filepath);
                        throw new error.ValidationError('Certificate Key is not valid (' + err.message + ')', err);
                    });
            });
    },

    /**
     * Uses the openssl command to both validate and get info out of the certificate.
     * It will save the file to disk first, then run commands on it, then delete the file.
     *
     * @param {String}  certificate      This is the entire cert contents as a string
     * @param {Boolean} [throw_expired]  Throw when the certificate is out of date
     */
    getCertificateInfo: (certificate, throw_expired) => {
        return tempWrite(certificate, '/tmp')
            .then(filepath => {
                let cert_data = {};

                return utils.exec('openssl x509 -in ' + filepath + ' -subject -noout')
                    .then(result => {
                        // subject=CN = something.example.com
                        let regex = /(?:subject=)?[^=]+=\s+(\S+)/gim;
                        let match = regex.exec(result);

                        if (typeof match[1] === 'undefined') {
                            throw new error.ValidationError('Could not determine subject from certificate: ' + result);
                        }

                        cert_data['cn'] = match[1];
                    })
                    .then(() => {
                        return utils.exec('openssl x509 -in ' + filepath + ' -issuer -noout');
                    })
                    .then(result => {
                        // issuer=C = US, O = Let's Encrypt, CN = Let's Encrypt Authority X3
                        let regex = /^(?:issuer=)?(.*)$/gim;
                        let match = regex.exec(result);

                        if (typeof match[1] === 'undefined') {
                            throw new error.ValidationError('Could not determine issuer from certificate: ' + result);
                        }

                        cert_data['issuer'] = match[1];
                    })
                    .then(() => {
                        return utils.exec('openssl x509 -in ' + filepath + ' -dates -noout');
                    })
                    .then(result => {
                        // notBefore=Jul 14 04:04:29 2018 GMT
                        // notAfter=Oct 12 04:04:29 2018 GMT
                        let valid_from = null;
                        let valid_to   = null;

                        let lines = result.split('\n');
                        lines.map(function (str) {
                            let regex = /^(\S+)=(.*)$/gim;
                            let match = regex.exec(str.trim());

                            if (match && typeof match[2] !== 'undefined') {
                                let date = parseInt(moment(match[2], 'MMM DD HH:mm:ss YYYY z').format('X'), 10);

                                if (match[1].toLowerCase() === 'notbefore') {
                                    valid_from = date;
                                } else if (match[1].toLowerCase() === 'notafter') {
                                    valid_to = date;
                                }
                            }
                        });

                        if (!valid_from || !valid_to) {
                            throw new error.ValidationError('Could not determine dates from certificate: ' + result);
                        }

                        if (throw_expired && valid_to < parseInt(moment().format('X'), 10)) {
                            throw new error.ValidationError('Certificate has expired');
                        }

                        cert_data['dates'] = {
                            from: valid_from,
                            to:   valid_to
                        };
                    })
                    .then(() => {
                        fs.unlinkSync(filepath);
                        return cert_data;
                    }).catch(err => {
                        fs.unlinkSync(filepath);
                        throw new error.ValidationError('Certificate is not valid (' + err.message + ')', err);
                    });
            });
    },

    /**
     * Cleans the ssl keys from the meta object and sets them to "true"
     *
     * @param   {Object}  meta
     * @param   {Boolean} [remove]
     * @returns {Object}
     */
    cleanMeta: function (meta, remove) {
        internalCertificate.allowed_ssl_files.map(key => {
            if (typeof meta[key] !== 'undefined' && meta[key]) {
                if (remove) {
                    delete meta[key];
                } else {
                    meta[key] = true;
                }
            }
        });
        return meta;
    }
};

module.exports = internalCertificate;
