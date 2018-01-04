'use strict';

const _ = require('lodash');

const db             = require('../db');
const error          = require('../lib/error');
const internalAccess = require('./access');
const internalSsl    = require('./ssl');
const internalNginx  = require('./nginx');
const timestamp      = require('unix-timestamp');

timestamp.round = true;

const internalHost = {

    /**
     * All Hosts
     *
     * @returns {Promise}
     */
    getAll: () => {
        return new Promise((resolve/*, reject*/) => {
            resolve(db.hosts.find());
        })
            .then(hosts => {
                _.map(hosts, (host, idx) => {
                    if (typeof host.access_list_id !== 'undefined' && host.access_list_id) {
                        hosts[idx].access_list = internalAccess.maskItems(db.access.findOne({_id: host.access_list_id}));
                    } else {
                        hosts[idx].access_list_id = '';
                        hosts[idx].access_list    = null;
                    }
                });

                return hosts;
            });
    },

    /**
     * Create a Host
     *
     * @param   {Object} payload
     * @returns {Promise}
     */
    create: payload => {
        return new Promise((resolve, reject) => {
            // Enforce lowercase hostnames
            payload.hostname = payload.hostname.toLowerCase();

            // 1. Check that the hostname doesn't already exist
            let existing_host = db.hosts.findOne({hostname: payload.hostname});

            if (existing_host) {
                reject(new error.ValidationError('Hostname already exists'));
            } else {
                // 2. Add host to db
                let host = db.hosts.save(payload);

                // 3. Fire the config generation for this host
                internalHost.configure(host, true)
                    .then((/*result*/) => {
                        resolve(host);
                    })
                    .catch(err => {
                        reject(err);
                    });
            }
        })
            .catch(err => {
                // Remove host if the configuration failed
                if (err instanceof error.ConfigurationError) {
                    db.hosts.remove({hostname: payload.hostname});
                    internalNginx.deleteConfig(payload);
                    internalSsl.deleteCerts(payload);
                }

                throw err;
            });
    },

    /**
     * Update a Host
     *
     * @param   {String} id
     * @param   {Object} payload
     * @returns {Promise}
     */
    update: (id, payload) => {
        return new Promise((resolve, reject) => {
            let original_host = db.hosts.findOne({_id: id});

            if (!original_host) {
                reject(new error.ValidationError('Host not found'));
            } else {
                // Enforce lowercase hostnames
                if (typeof payload.hostname !== 'undefined') {
                    payload.hostname = payload.hostname.toLowerCase();
                }

                // Check that the hostname doesn't already exist
                let other_host = db.hosts.findOne({hostname: payload.hostname});

                if (other_host && other_host._id !== id) {
                    reject(new error.ValidationError('Hostname already exists'));
                } else {
                    // 2. Update host
                    db.hosts.update({_id: id}, payload, {multi: false, upsert: false});
                    let updated_host = db.hosts.findOne({_id: id});

                    resolve({
                        original: original_host,
                        updated:  updated_host
                    });
                }
            }
        })
            .then(data => {
                if (data.original.hostname !== data.updated.hostname) {
                    // Hostname has changed, delete the old file
                    return internalNginx.deleteConfig(data.original)
                        .then(() => {
                            return data;
                        });
                }

                return data;
            })
            .then(data => {
                if (
                    (data.original.ssl && !data.updated.ssl) ||                             // ssl was enabled and is now disabled
                    (data.original.ssl && data.original.hostname !== data.updated.hostname) // hostname was changed for a previously ssl-enabled host
                ) {
                    // SSL was turned off or hostname for ssl has changed so we should remove certs for the original
                    return internalSsl.deleteCerts(data.original)
                        .then(() => {
                            db.hosts.update({_id: data.updated._id}, {ssl_expires: 0}, {multi: false, upsert: false});
                            data.updated.ssl_expires = 0;
                            return data;
                        });
                }

                return data;
            })
            .then(data => {
                // 3. Fire the config generation for this host
                return internalHost.configure(data.updated, true)
                    .then((/*result*/) => {
                        return data.updated;
                    });
            });
    },

    /**
     * This will create the nginx config for the host and fire off letsencrypt duties if required
     *
     * @param   {Object}  host
     * @param   {Boolean} [reload_nginx]
     * @returns {Promise}
     */
    configure: (host, reload_nginx) => {
        return new Promise((resolve/*, reject*/) => {
            resolve(internalNginx.deleteConfig(host));
        })
            .then(() => {
                if (host.ssl && !internalSsl.hasValidSslCerts(host)) {
                    return internalSsl.configureSsl(host);
                }
            })
            .then(() => {
                return internalNginx.generateConfig(host);
            })
            .then(() => {
                if (reload_nginx) {
                    return internalNginx.reload();
                }
            });
    },

    /**
     * Deletes a Host
     *
     * @param   {String}  id
     * @returns {Promise}
     */
    delete: id => {
        let existing_host = db.hosts.findOne({_id: id});
        return new Promise((resolve, reject) => {
            if (existing_host) {
                db.hosts.update({_id: id}, {is_deleted: true}, {multi: true, upsert: false});
                resolve(internalNginx.deleteConfig(existing_host));
            } else {
                reject(new error.ValidationError('Hostname does not exist'));
            }
        })
            .then(() => {
                if (existing_host.ssl) {
                    return internalSsl.deleteCerts(existing_host);
                }
            })
            .then(() => {
                db.hosts.remove({_id: id}, false);
                return internalNginx.reload();
            })
            .then(() => {
                return true;
            });
    },

    /**
     * Reconfigure a Host
     *
     * @param   {String} id
     * @returns {Promise}
     */
    reconfigure: id => {
        return new Promise((resolve, reject) => {
            let host = db.hosts.findOne({_id: id});

            if (!host) {
                reject(new error.ValidationError('Host does not exist: ' + id));
            } else {
                // 3. Fire the config generation for this host
                internalHost.configure(host, true)
                    .then((/*result*/) => {
                        resolve(host);
                    })
                    .catch(err => {
                        reject(err);
                    });
            }
        });
    },

    /**
     * Renew SSL for a Host
     *
     * @param   {String} id
     * @returns {Promise}
     */
    renew: id => {
        return new Promise((resolve, reject) => {
            let host = db.hosts.findOne({_id: id});

            if (!host) {
                reject(new error.ValidationError('Host does not exist'));
            } else if (!host.ssl) {
                reject(new error.ValidationError('Host does not have SSL enabled'));
            } else {
                // 3. Fire the ssl and config generation for this host, forcing ssl
                internalSsl.renewSsl(host)
                    .then((/*result*/) => {
                        resolve(host);
                    })
                    .catch(err => {
                        reject(err);
                    });
            }
        });
    }
};

module.exports = internalHost;
