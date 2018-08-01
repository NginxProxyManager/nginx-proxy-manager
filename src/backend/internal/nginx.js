'use strict';

const fs     = require('fs');
const Liquid = require('liquidjs');
const logger = require('../logger').nginx;
const utils  = require('../lib/utils');
const error  = require('../lib/error');

const internalNginx = {

    /**
     * @returns {Promise}
     */
    test: () => {
        logger.info('Testing Nginx configuration');
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
        let renderEngine = Liquid();
        host_type        = host_type.replace(new RegExp('-', 'g'), '_');

        return new Promise((resolve, reject) => {
            let template = null;
            let filename = internalNginx.getConfigName(host_type, host.id);
            try {
                template = fs.readFileSync(__dirname + '/../templates/' + host_type + '.conf', {encoding: 'utf8'});
            } catch (err) {
                reject(new error.ConfigurationError(err.message));
                return;
            }

            return renderEngine
                .parseAndRender(template, host)
                .then(config_text => {
                    fs.writeFileSync(filename, config_text, {encoding: 'utf8'});
                    return true;
                })
                .catch(err => {
                    throw new error.ConfigurationError(err.message);
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
        return new Promise((resolve, reject) => {
            try {
                fs.unlinkSync(internalNginx.getConfigName(host_type, host.id));
            } catch (err) {
                if (throw_errors) {
                    reject(err);
                }
            }

            resolve();
        });
    }
};

module.exports = internalNginx;
