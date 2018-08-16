'use strict';

const _                   = require('lodash');
const fs                  = require('fs');
const Liquid              = require('liquidjs');
const logger              = require('../logger').nginx;
const utils               = require('../lib/utils');
const error               = require('../lib/error');
const internalCertificate = require('./certificate');
const debug_mode          = process.env.NODE_ENV !== 'production';

const internalNginx = {

    /**
     * This will:
     * - test the nginx config first to make sure it's OK
     * - create / recreate the config for the host
     * - test again
     * - IF OK:  update the meta with online status
     * - IF BAD: update the meta with offline status and remove the config entirely
     * - then reload nginx
     *
     * @param   {Object}  model
     * @param   {String}  host_type
     * @param   {Object}  host
     * @returns {Promise}
     */
    configure: (model, host_type, host) => {
        return internalNginx.test()
            .then(() => {
                // Nginx is OK
                // We're deleting this config regardless.
                return internalNginx.deleteConfig(host_type, host); // Don't throw errors, as the file may not exist at all
            })
            .then(() => {
                return internalNginx.generateConfig(host_type, host);
            })
            .then(() => {
                // Test nginx again and update meta with result
                return internalNginx.test()
                    .then(() => {
                        // nginx is ok
                        return model
                            .query()
                            .where('id', host.id)
                            .patch({
                                meta: _.assign({}, host.meta, {
                                    nginx_online: true,
                                    nginx_err:    null
                                })
                            });
                    })
                    .catch(err => {
                        if (debug_mode) {
                            logger.error('Nginx test failed:', err.message);
                        }

                        // config is bad, update meta and delete config
                        return model
                            .query()
                            .where('id', host.id)
                            .patch({
                                meta: _.assign({}, host.meta, {
                                    nginx_online: false,
                                    nginx_err:    err.message
                                })
                            })
                            .then(() => {
                                return internalNginx.deleteConfig(host_type, host, true);
                            });
                    });
            })
            .then(() => {
                return internalNginx.reload();
            });
    },

    /**
     * @returns {Promise}
     */
    test: () => {
        if (debug_mode) {
            logger.info('Testing Nginx configuration');
        }

        return utils.exec('/usr/sbin/nginx -t');
    },

    /**
     * @returns {Promise}
     */
    reload: () => {
        return internalNginx.test()
            .then(() => {
                logger.info('Reloading Nginx');
                return utils.exec('/usr/sbin/nginx -s reload');
            });
    },

    /**
     * @param   {String}  host_type
     * @param   {Integer} host_id
     * @returns {String}
     */
    getConfigName: (host_type, host_id) => {
        host_type = host_type.replace(new RegExp('-', 'g'), '_');
        return '/data/nginx/' + host_type + '/' + host_id + '.conf';
    },

    /**
     * @param   {String}  host_type
     * @param   {Object}  host
     * @returns {Promise}
     */
    generateConfig: (host_type, host) => {
        host_type = host_type.replace(new RegExp('-', 'g'), '_');

        if (debug_mode) {
            logger.info('Generating ' + host_type + ' Config:', host);
        }

        let renderEngine = Liquid({
            root: __dirname + '/../templates/',
        });

        return new Promise((resolve, reject) => {
            let template = null;
            let filename = internalNginx.getConfigName(host_type, host.id);
            try {
                template = fs.readFileSync(__dirname + '/../templates/' + host_type + '.conf', {encoding: 'utf8'});
            } catch (err) {
                reject(new error.ConfigurationError(err.message));
                return;
            }

            renderEngine
                .parseAndRender(template, host)
                .then(config_text => {
                    fs.writeFileSync(filename, config_text, {encoding: 'utf8'});

                    if (debug_mode) {
                        logger.success('Wrote config:', filename, config_text);
                    }

                    resolve(true);
                })
                .catch(err => {
                    if (debug_mode) {
                        logger.warn('Could not write ' + filename + ':', err.message);
                    }

                    reject(new error.ConfigurationError(err.message));
                });
        });
    },

    /**
     * @param   {String}  host_type
     * @param   {Object}  host
     * @param   {Boolean} [throw_errors]
     * @returns {Promise}
     */
    deleteConfig: (host_type, host, throw_errors) => {
        host_type = host_type.replace(new RegExp('-', 'g'), '_');

        return new Promise((resolve, reject) => {
            try {
                let config_file = internalNginx.getConfigName(host_type, host.id);

                if (debug_mode) {
                    logger.warn('Deleting nginx config: ' + config_file);
                }

                fs.unlinkSync(config_file);
            } catch (err) {
                if (debug_mode) {
                    logger.warn('Could not delete config:', err.message);
                }

                if (throw_errors) {
                    reject(err);
                }
            }

            resolve();
        });
    }
};

module.exports = internalNginx;
