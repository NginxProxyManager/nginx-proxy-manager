const fs         = require('fs');
const logger     = require('./logger').import;
const utils      = require('./lib/utils');
const batchflow  = require('batchflow');
const debug_mode = process.env.NODE_ENV !== 'production' || !!process.env.DEBUG;

const internalProxyHost       = require('./internal/proxy-host');
const internalRedirectionHost = require('./internal/redirection-host');
const internalDeadHost        = require('./internal/dead-host');
const internalNginx           = require('./internal/nginx');
const internalAccessList      = require('./internal/access-list');
const internalStream          = require('./internal/stream');
const internalCertificate     = require('./internal/certificate');

const accessListModel      = require('./models/access_list');
const accessListAuthModel  = require('./models/access_list_auth');
const proxyHostModel       = require('./models/proxy_host');
const redirectionHostModel = require('./models/redirection_host');
const deadHostModel        = require('./models/dead_host');
const streamModel          = require('./models/stream');
const certificateModel     = require('./models/certificate');

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
            // 1. List all folders in `archive`
            // 2. Create certificates from those folders, rename them, add to map
            // 3.

            try {
                resolve(fs.readdirSync('/etc/letsencrypt/archive'));
            } catch (err) {
                reject(err);
            }
        })
            .then(archive_dirs => {
                return new Promise((resolve, reject) => {
                    batchflow(archive_dirs).sequential()
                        .each((i, archive_dir_name, next) => {
                            importCertificate(access, archive_dir_name)
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

            });
    };

    /**
     * @param   {Access}  access
     * @param   {String}  archive_dir_name
     * @returns {Promise}
     */
    const importCertificate = function (access, archive_dir_name) {
        logger.info('Importing Certificate: ' + archive_dir_name);

        let full_archive_path = '/etc/letsencrypt/archive/' + archive_dir_name;
        let full_live_path    = '/etc/letsencrypt/live/' + archive_dir_name;

        let new_archive_path = '/etc/letsencrypt/archive/';
        let new_live_path    = '/etc/letsencrypt/live/';

        // 1. Create certificate row to get the ID
        return certificateModel
            .query()
            .insertAndFetch({
                owner_user_id: 1,
                provider:      'letsencrypt',
                nice_name:     archive_dir_name,
                domain_names:  [archive_dir_name]
            })
            .then(certificate => {
                certificate_map[archive_dir_name] = certificate.id;

                // 2. rename archive folder name
                new_archive_path = new_archive_path + 'npm-' + certificate.id;
                fs.renameSync(full_archive_path, new_archive_path);

                return certificate;
            })
            .then(certificate => {
                // 3. rename live folder name
                new_live_path = new_live_path + 'npm-' + certificate.id;
                fs.renameSync(full_live_path, new_live_path);

                // and also update the symlinks in this folder:
                process.chdir(new_live_path);
                let version = getCertificateVersion(new_archive_path);
                let names   = [
                    ['cert.pem', 'cert' + version + '.pem'],
                    ['chain.pem', 'chain' + version + '.pem'],
                    ['fullchain.pem', 'fullchain' + version + '.pem'],
                    ['privkey.pem', 'privkey' + version + '.pem']
                ];

                names.map(function (name) {
                    // remove symlink
                    try {
                        fs.unlinkSync(new_live_path + '/' + name[0]);
                    } catch (err) {
                        // do nothing
                        logger.error(err);
                    }

                    // create new symlink
                    fs.symlinkSync('../../archive/npm-' + certificate.id + '/' + name[1], name[0]);
                });

                return certificate;
            })
            .then(certificate => {
                // 4. rename and update renewal config file
                let config_file = '/etc/letsencrypt/renewal/' + archive_dir_name + '.conf';

                return utils.exec('sed -i \'s/\\/config/\\/data/g\' ' + config_file)
                    .then(() => {
                        let escaped = archive_dir_name.split('.').join('\\.');
                        return utils.exec('sed -i \'s/\\/' + escaped + '/\\/npm-' + certificate.id + '/g\' ' + config_file);
                    })
                    .then(() => {
                        //rename config file
                        fs.renameSync(config_file, '/etc/letsencrypt/renewal/npm-' + certificate.id + '.conf');
                        return certificate;
                    });
            })
            .then(certificate => {
                // 5. read the cert info back in to the db
                return internalCertificate.getCertificateInfoFromFile(new_live_path + '/fullchain.pem')
                    .then(cert_info => {
                        return certificateModel
                            .query()
                            .patchAndFetchById(certificate.id, {
                                expires_on: certificateModel.raw('FROM_UNIXTIME(' + cert_info.dates.to + ')')
                            });
                    });
            });
    };

    /**
     * @param   {String}  archive_path
     * @returns {Integer}
     */
    const getCertificateVersion = function (archive_path) {
        let version = 1;

        try {
            let files = fs.readdirSync(archive_path);

            files.map(function (file) {
                let res = file.match(/fullchain([0-9])+?\.pem/im);
                if (res && parseInt(res[1], 10) > version) {
                    version = parseInt(res[1], 10);
                }
            });

        } catch (err) {
            // do nothing
        }

        return version;
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

        return proxyHostModel
            .query()
            .insertAndFetch({
                owner_user_id:   1,
                domain_names:    [host.hostname],
                forward_host:    host.forward_server,
                forward_port:    host.forward_port,
                access_list_id:  access_list_id,
                certificate_id:  certificate_id,
                ssl_forced:      host.force_ssl || false,
                caching_enabled: host.asset_caching || false,
                block_exploits:  host.block_exploits || false,
                advanced_config: host.advanced || '',
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

        return deadHostModel
            .query()
            .insertAndFetch({
                owner_user_id:   1,
                domain_names:    [host.hostname],
                certificate_id:  certificate_id,
                ssl_forced:      host.force_ssl || false,
                advanced_config: host.advanced || '',
                meta:            meta
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

        return redirectionHostModel
            .query()
            .insertAndFetch({
                owner_user_id:       1,
                domain_names:        [host.hostname],
                forward_domain_name: host.forward_host,
                block_exploits:      host.block_exploits || false,
                certificate_id:      certificate_id,
                ssl_forced:          host.force_ssl || false,
                advanced_config:     host.advanced || '',
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
                            fs.writeFile('/config/v2-imported', 'true', function (err) {
                                if (err) {
                                    logger.err(err);
                                }
                            });
                        });
                })
            );

        } else {
            if (debug_mode) {
                logger.debug('Importer skipped');
            }

            resolve();
        }
    });
};
