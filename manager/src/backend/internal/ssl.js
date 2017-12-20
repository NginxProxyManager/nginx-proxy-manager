'use strict';

const _             = require('lodash');
const fs            = require('fs');
const ejs           = require('ejs');
const timestamp     = require('unix-timestamp');
const batchflow     = require('batchflow');
const internalNginx = require('./nginx');
const logger        = require('../logger');
const db            = require('../db');
const utils         = require('../lib/utils');
const error         = require('../lib/error');

timestamp.round = true;

const internalSsl = {

    interval_timeout:    60 * 1000,
    interval:            null,
    interval_processing: false,

    initTimer: () => {
        internalSsl.interval = setInterval(internalSsl.processExpiringHosts, internalSsl.interval_timeout);
    },

    /**
     * Triggered by a timer, this will check for expiring hosts and renew their ssl certs if required
     */
    processExpiringHosts: () => {
        if (!internalSsl.interval_processing) {
            let hosts = db.hosts.find();

            if (hosts && hosts.length) {
                internalSsl.interval_processing = true;

                batchflow(hosts).sequential()
                    .each((i, host, next) => {
                        if ((typeof host.is_deleted === 'undefined' || !host.is_deleted) && host.ssl && typeof host.ssl_expires !== 'undefined' && !internalSsl.hasValidSslCerts(host)) {
                            // This host is due to expire in 1 day, time to renew
                            logger.info('Host ' + host.hostname + ' is due for SSL renewal');

                            internalSsl.configureSsl(host)
                                .then(() => {
                                    return internalNginx.generateConfig(host);
                                })
                                .then(internalNginx.reload)
                                .then(next)
                                .catch(err => {
                                    logger.error(err);
                                    next(err);
                                });
                        } else {
                            next();
                        }
                    })
                    .error(err => {
                        logger.error(err);
                        internalSsl.interval_processing = false;
                    })
                    .end((/*results*/) => {
                        internalSsl.interval_processing = false;
                    });
            }
        }
    },

    /**
     * @param   {Object}  host
     * @returns {Boolean}
     */
    hasValidSslCerts: host => {
        return fs.existsSync('/etc/letsencrypt/live/' + host.hostname + '/fullchain.pem') &&
            fs.existsSync('/etc/letsencrypt/live/' + host.hostname + '/privkey.pem') &&
            host.ssl_expires > timestamp.now('+1d');
    },

    /**
     * @param   {Object}  host
     * @returns {Promise}
     */
    requestSsl: host => {
        logger.info('Requesting SSL certificates for ' + host.hostname);

        return utils.exec('/usr/bin/letsencrypt certonly --agree-tos --email "' + host.letsencrypt_email + '" -n -a webroot --webroot-path=' + host.root_path + ' -d "' + host.hostname + '"')
            .then(result => {
                logger.info(result);
                return result;
            });
    },

    /**
     * @param   {Object}  host
     * @returns {Promise}
     */
    deleteCerts: host => {
        logger.info('Deleting SSL certificates for ' + host.hostname);

        return utils.exec('/usr/bin/letsencrypt delete -n --cert-name "' + host.hostname + '"')
            .then(result => {
                logger.info(result);
            })
            .catch(err => {
                logger.error(err);
            });
    },

    /**
     * @param   {Object}  host
     * @returns {Promise}
     */
    generateSslSetupConfig: host => {
        let template      = null;
        let filename      = internalNginx.getConfigName(host);
        let template_data = host;

        template_data.root_path = '/tmp/' + host.hostname;

        return utils.exec('mkdir -p ' + template_data.root_path)
            .then(() => {
                try {
                    template        = fs.readFileSync(__dirname + '/../templates/letsencrypt.conf.ejs', {encoding: 'utf8'});
                    let config_text = ejs.render(template, template_data);
                    fs.writeFileSync(filename, config_text, {encoding: 'utf8'});

                    return template_data;
                } catch (err) {
                    throw new error.ConfigurationError(err.message);
                }
            });
    },

    /**
     * @param   {Object}  host
     * @returns {Promise}
     */
    configureSsl: host => {
        return internalSsl.generateSslSetupConfig(host)
            .then(data => {
                return internalNginx.reload()
                    .then(() => {
                        return internalSsl.requestSsl(data);
                    });
            })
            .then(() => {
                // Certificate was requested ok, update the timestamp on the host
                db.hosts.update({_id: host._id}, {ssl_expires: timestamp.now('+90d')}, {multi: false, upsert: false});
            });
    }
};

module.exports = internalSsl;
