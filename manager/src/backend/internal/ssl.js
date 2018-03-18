'use strict';

const fs            = require('fs');
const ejs           = require('ejs');
const timestamp     = require('unix-timestamp');
const internalNginx = require('./nginx');
const logger        = require('../logger');
const utils         = require('../lib/utils');
const error         = require('../lib/error');

timestamp.round = true;

const internalSsl = {

    interval_timeout:    1000 * 60 * 60 * 6, // 6 hours
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
     * @param   {Object}  host
     * @returns {Boolean}
     */
    hasValidSslCerts: host => {
        return fs.existsSync('/etc/letsencrypt/live/' + host.hostname + '/fullchain.pem') &&
            fs.existsSync('/etc/letsencrypt/live/' + host.hostname + '/privkey.pem');
    },

    /**
     * @param   {Object}  host
     * @returns {Promise}
     */
    requestSsl: host => {
        logger.info('Requesting SSL certificates for ' + host.hostname);

        return utils.exec('/usr/bin/letsencrypt certonly --agree-tos --email "' + host.letsencrypt_email + '" -n -a webroot -d "' + host.hostname + '"')
            .then(result => {
                logger.info(result);
                return result;
            });
    },

    /**
     * @param   {Object}  host
     * @returns {Promise}
     */
    renewSsl: host => {
        logger.info('Renewing SSL certificates for ' + host.hostname);

        return utils.exec('/usr/bin/certbot renew --force-renewal --disable-hook-validation --cert-name "' + host.hostname + '"')
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

        return utils.exec('/usr/bin/certbot delete -n --cert-name "' + host.hostname + '"')
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

        return new Promise((resolve, reject) => {
            try {
                template        = fs.readFileSync(__dirname + '/../templates/letsencrypt.conf.ejs', {encoding: 'utf8'});
                let config_text = ejs.render(template, template_data);
                fs.writeFileSync(filename, config_text, {encoding: 'utf8'});

                resolve(template_data);
            } catch (err) {
                reject(new error.ConfigurationError(err.message));
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
            });
    }
};

module.exports = internalSsl;
