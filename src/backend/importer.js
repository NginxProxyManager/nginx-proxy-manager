'use strict';

const fs        = require('fs');
const logger    = require('./logger').import;
const utils     = require('./lib/utils');
const batchflow = require('batchflow');

const internalProxyHost       = require('./internal/proxy-host');
const internalRedirectionHost = require('./internal/redirection-host');
const internalDeadHost        = require('./internal/dead-host');
const internalNginx           = require('./internal/nginx');
const internalAccessList      = require('./internal/access-list');
const internalStream          = require('./internal/stream');

const accessListModel      = require('./models/access_list');
const accessListAuthModel  = require('./models/access_list_auth');
const proxyHostModel       = require('./models/proxy_host');
const redirectionHostModel = require('./models/redirection_host');
const deadHostModel        = require('./models/dead_host');
const streamModel          = require('./models/stream');

module.exports = function () {

    let access_map      = {};
    let certificate_map = {};

    /**
     * @param   {Access} access
     * @param   {Object} db
     * @returns {Promise}
     */
    const importAccessLists = function (access, db) {
        return new Promise((resolve, reject) => {
            let lists = db.access.find();

            batchflow(lists).sequential()
                .each((i, list, next) => {

                    importAccessList(access, list)
                        .then(() => {
                            next();
                        })
                        .catch(err => {
                            next(err);
                        });
                })
                .end(results => {
                    resolve(results);
                });
        });
    };

    /**
     * @param   {Access} access
     * @param   {Object} list
     * @returns {Promise}
     */
    const importAccessList = function (access, list) {
        // Create the list
        logger.info('Creating Access List: ' + list.name);

        return accessListModel
            .query()
            .insertAndFetch({
                name:          list.name,
                owner_user_id: 1
            })
            .then(row => {
                access_map[list._id] = row.id;

                return new Promise((resolve, reject) => {
                    batchflow(list.items).sequential()
                        .each((i, item, next) => {
                            if (typeof item.password !== 'undefined' && item.password.length) {
                                logger.info('Adding to Access List: ' + item.username);

                                accessListAuthModel
                                    .query()
                                    .insert({
                                        access_list_id: row.id,
                                        username:       item.username,
                                        password:       item.password
                                    })
                                    .then(() => {
                                        next();
                                    })
                                    .catch(err => {
                                        logger.error(err);
                                        next(err);
                                    });
                            }
                        })
                        .error(err => {
                            logger.error(err);
                            reject(err);
                        })
                        .end(results => {
                            logger.success('Finished importing Access List: ' + list.name);
                            resolve(results);
                        });
                })
                    .then(() => {
                        return internalAccessList.get(access, {
                            id:     row.id,
                            expand: ['owner', 'items']
                        }, true /* <- skip masking */);
                    })
                    .then(full_list => {
                        return internalAccessList.build(full_list);
                    });
            });
    };

    /**
     * @param   {Access} access
     * @returns {Promise}
     */
    const importCertificates = function (access) {
        // This step involves transforming the letsencrypt folder structure significantly.

        // - /etc/letsencrypt/accounts      Do not touch
        // - /etc/letsencrypt/archive       Modify directory names
        // - /etc/letsencrypt/csr           Do not touch
        // - /etc/letsencrypt/keys          Do not touch
        // - /etc/letsencrypt/live          Modify directory names, modify file symlinks
        // - /etc/letsencrypt/renewal       Modify filenames and file content

        return new Promise((resolve, reject) => {
            // TODO
            resolve();
        });
    };

    /**
     * @param   {Access} access
     * @param   {Object} db
     * @returns {Promise}
     */
    const importHosts = function (access, db) {
        return new Promise((resolve, reject) => {
            let hosts = db.hosts.find();

            batchflow(hosts).sequential()
                .each((i, host, next) => {
                    importHost(access, host)
                        .then(() => {
                            next();
                        })
                        .catch(err => {
                            next(err);
                        });
                })
                .end(results => {
                    resolve(results);
                });
        });
    };

    /**
     * @param   {Access} access
     * @param   {Object} host
     * @returns {Promise}
     */
    const importHost = function (access, host) {
        // Create the list
        if (typeof host.type === 'undefined') {
            host.type = 'proxy';
        }

        switch (host.type) {
            case 'proxy':
                return importProxyHost(access, host);
            case '404':
                return importDeadHost(access, host);
            case 'redirection':
                return importRedirectionHost(access, host);
            case 'stream':
                return importStream(access, host);
            default:
                return Promise.resolve();
        }
    };

    /**
     * @param   {Access} access
     * @param   {Object} host
     * @returns {Promise}
     */
    const importProxyHost = function (access, host) {
        logger.info('Creating Proxy Host: ' + host.hostname);

        let access_list_id = 0;
        let certificate_id = 0;
        let meta           = {};

        if (typeof host.letsencrypt_email !== 'undefined') {
            meta.letsencrypt_email = host.letsencrypt_email;
        }

        // determine access_list_id
        if (typeof host.access_list_id !== 'undefined' && host.access_list_id && typeof access_map[host.access_list_id] !== 'undefined') {
            access_list_id = access_map[host.access_list_id];
        }

        // determine certificate_id
        if (host.ssl && typeof certificate_map[host.hostname] !== 'undefined') {
            certificate_id = certificate_map[host.hostname];
        }

        // TODO: Advanced nginx config

        return proxyHostModel
            .query()
            .insertAndFetch({
                owner_user_id:   1,
                domain_names:    [host.hostname],
                forward_ip:      host.forward_server,
                forward_port:    host.forward_port,
                access_list_id:  access_list_id,
                certificate_id:  certificate_id,
                ssl_forced:      host.force_ssl || false,
                caching_enabled: host.asset_caching || false,
                block_exploits:  host.block_exploits || false,
                meta:            meta
            })
            .then(row => {
                // re-fetch with cert
                return internalProxyHost.get(access, {
                    id:     row.id,
                    expand: ['certificate', 'owner', 'access_list']
                });
            })
            .then(row => {
                // Configure nginx
                return internalNginx.configure(proxyHostModel, 'proxy_host', row);
            });
    };

    /**
     * @param   {Access} access
     * @param   {Object} host
     * @returns {Promise}
     */
    const importDeadHost = function (access, host) {
        logger.info('Creating 404 Host: ' + host.hostname);

        let certificate_id = 0;
        let meta           = {};

        if (typeof host.letsencrypt_email !== 'undefined') {
            meta.letsencrypt_email = host.letsencrypt_email;
        }

        // determine certificate_id
        if (host.ssl && typeof certificate_map[host.hostname] !== 'undefined') {
            certificate_id = certificate_map[host.hostname];
        }

        // TODO: Advanced nginx config

        return deadHostModel
            .query()
            .insertAndFetch({
                owner_user_id:  1,
                domain_names:   [host.hostname],
                certificate_id: certificate_id,
                ssl_forced:     host.force_ssl || false,
                meta:           meta
            })
            .then(row => {
                // re-fetch with cert
                return internalDeadHost.get(access, {
                    id:     row.id,
                    expand: ['certificate', 'owner']
                });
            })
            .then(row => {
                // Configure nginx
                return internalNginx.configure(deadHostModel, 'dead_host', row);
            });
    };

    /**
     * @param   {Access} access
     * @param   {Object} host
     * @returns {Promise}
     */
    const importRedirectionHost = function (access, host) {
        logger.info('Creating Redirection Host: ' + host.hostname);

        let certificate_id = 0;
        let meta           = {};

        if (typeof host.letsencrypt_email !== 'undefined') {
            meta.letsencrypt_email = host.letsencrypt_email;
        }

        // determine certificate_id
        if (host.ssl && typeof certificate_map[host.hostname] !== 'undefined') {
            certificate_id = certificate_map[host.hostname];
        }

        // TODO: Advanced nginx config

        return redirectionHostModel
            .query()
            .insertAndFetch({
                owner_user_id:       1,
                domain_names:        [host.hostname],
                forward_domain_name: host.forward_host,
                block_exploits:      host.block_exploits || false,
                certificate_id:      certificate_id,
                ssl_forced:          host.force_ssl || false,
                meta:                meta
            })
            .then(row => {
                // re-fetch with cert
                return internalRedirectionHost.get(access, {
                    id:     row.id,
                    expand: ['certificate', 'owner']
                });
            })
            .then(row => {
                // Configure nginx
                return internalNginx.configure(redirectionHostModel, 'redirection_host', row);
            });
    };

    /**
     * @param   {Access} access
     * @param   {Object} host
     * @returns {Promise}
     */
    const importStream = function (access, host) {
        logger.info('Creating Stream: ' + host.incoming_port);

        // TODO: Advanced nginx config

        return streamModel
            .query()
            .insertAndFetch({
                owner_user_id:   1,
                incoming_port:   host.incoming_port,
                forward_ip:      host.forward_server,
                forwarding_port: host.forward_port,
                tcp_forwarding:  host.protocols.indexOf('tcp') !== -1,
                udp_forwarding:  host.protocols.indexOf('udp') !== -1
            })
            .then(row => {
                // re-fetch with cert
                return internalStream.get(access, {
                    id:     row.id,
                    expand: ['owner']
                });
            })
            .then(row => {
                // Configure nginx
                return internalNginx.configure(streamModel, 'stream', row);
            });
    };

    /**
     * Returned Promise
     */
    return new Promise((resolve, reject) => {
        if (fs.existsSync('/config') && !fs.existsSync('/config/v2-imported')) {

            logger.info('Beginning import from V1 ...');

            const db       = require('diskdb');
            module.exports = db.connect('/config', ['hosts', 'access']);

            // Create a fake access object
            const Access = require('./lib/access');
            let access   = new Access(null);

            resolve(access.load(true)
                .then(() => {
                    // Import access lists first
                    return importAccessLists(access, db)
                        .then(() => {
                            // Then import Lets Encrypt Certificates
                            return importCertificates(access);
                        })
                        .then(() => {
                            // then hosts
                            return importHosts(access, db);
                        })
                        .then(() => {
                            // Write the /config/v2-imported file so we don't import again
                            // TODO
                        });
                })
            );

        } else {
            resolve();
        }
    });
};
