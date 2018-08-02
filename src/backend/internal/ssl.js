'use strict';

const fs            = require('fs');
const Liquid        = require('liquidjs');
const timestamp     = require('unix-timestamp');
const internalNginx = require('./nginx');
const logger        = require('../logger').ssl;
const utils         = require('../lib/utils');
const error         = require('../lib/error');

timestamp.round = true;

const internalSsl = {

    interval_timeout:    1000 * 60 * 60 * 12, // 12 hours
    interval:            null,
    interval_processing: false,

    initTimer: () => {
        logger.info('Let\'s Encrypt Renewal Timer initialized');
        internalSsl.interval = setInterval(internalSsl.processExpiringHosts, internalSsl.interval_timeout);
    },

    /**
     * Triggered by a timer, this will check for expiring hosts and renew their ssl certs if required
     */
    processExpiringHosts: () => {
        if (!internalSsl.interval_processing) {
            logger.info('Renewing SSL certs close to expiry...');
            return utils.exec('/usr/bin/certbot renew -q')
                .then(result => {
                    logger.info(result);
                    internalSsl.interval_processing = false;

                    return internalNginx.reload()
                        .then(() => {
                            logger.info('Renew Complete');
                            return result;
                        });
                })
                .catch(err => {
                    logger.error(err);
                    internalSsl.interval_processing = false;
                });
        }
    },

    /**
     * @param   {String}  host_type
     * @param   {Object}  host
     * @returns {Boolean}
     */
    hasValidSslCerts: (host_type, host) => {
        host_type   = host_type.replace(new RegExp('-', 'g'), '_');
        let le_path = '/etc/letsencrypt/live/' + host_type + '-' + host.id;

        return fs.existsSync(le_path + '/fullchain.pem') && fs.existsSync(le_path + '/privkey.pem');
    },

    /**
     * @param   {String}  host_type
     * @param   {Object}  host
     * @returns {Promise}
     */
    requestSsl: (host_type, host) => {
        logger.info('Requesting SSL certificates for ' + host_type + ' #' + host.id);

        // TODO

        return utils.exec('/usr/bin/letsencrypt certonly --agree-tos --email "' + host.letsencrypt_email + '" -n -a webroot -d "' + host.hostname + '"')
            .then(result => {
                logger.info(result);
                return result;
            });
    },

    /**
     * @param   {String}  host_type
     * @param   {Object}  host
     * @returns {Promise}
     */
    renewSsl: (host_type, host) => {
        logger.info('Renewing SSL certificates for ' + host_type + ' #' + host.id);

        // TODO

        return utils.exec('/usr/bin/certbot renew --force-renewal --disable-hook-validation --cert-name "' + host.hostname + '"')
            .then(result => {
                logger.info(result);
                return result;
            });
    },

    /**
     * @param   {String}  host_type
     * @param   {Object}  host
     * @returns {Promise}
     */
    deleteCerts: (host_type, host) => {
        logger.info('Deleting SSL certificates for ' + host_type + ' #' + host.id);

        // TODO

        return utils.exec('/usr/bin/certbot delete -n --cert-name "' + host.hostname + '"')
            .then(result => {
                logger.info(result);
            })
            .catch(err => {
                logger.error(err);
            });
    },

    /**
     * @param   {String}  host_type
     * @param   {Object}  host
     * @returns {Promise}
     */
    generateSslSetupConfig: (host_type, host) => {
        host_type = host_type.replace(new RegExp('-', 'g'), '_');

        let renderEngine = Liquid();
        let template     = null;
        let filename     = internalNginx.getConfigName(host_type, host);

        return new Promise((resolve, reject) => {
            try {
                template = fs.readFileSync(__dirname + '/../templates/letsencrypt.conf', {encoding: 'utf8'});
            } catch (err) {
                reject(new error.ConfigurationError(err.message));
                return;
            }

            return renderEngine
                .parseAndRender(template, host)
                .then(config_text => {
                    fs.writeFileSync(filename, config_text, {encoding: 'utf8'});
                    return template_data;
                })
                .catch(err => {
                    throw new error.ConfigurationError(err.message);
                });
        });
    },

    /**
     * @param   {String}  host_type
     * @param   {Object}  host
     * @returns {Promise}
     */
    configureSsl: (host_type, host) => {

        // TODO

        return internalSsl.generateSslSetupConfig(host)
            .then(data => {
                return internalNginx.reload()
                    .then(() => {
                        return internalSsl.requestSsl(data);
                    });
            });
    }
};

module.exports = internalSsl;
