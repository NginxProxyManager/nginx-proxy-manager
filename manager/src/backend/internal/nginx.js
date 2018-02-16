'use strict';

const fs     = require('fs');
const ejs    = require('ejs');
const logger = require('../logger');
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
     * @param   {Object}  host
     * @returns {String}
     */
    getConfigName: host => {
        if (host.type === 'stream') {
            return '/config/nginx/stream/' + host.incoming_port + '.conf';
        }

        return '/config/nginx/' + host.hostname + '.conf';
    },

    /**
     * @param   {Object} host
     * @returns {Promise}
     */
    generateConfig: host => {
        return new Promise((resolve, reject) => {
            let template = null;
            let filename = internalNginx.getConfigName(host);

            try {
                if (typeof host.type === 'undefined' || !host.type) {
                    host.type = 'proxy';
                }

                template        = fs.readFileSync(__dirname + '/../templates/' + host.type + '.conf.ejs', {encoding: 'utf8'});
                let config_text = ejs.render(template, host);
                fs.writeFileSync(filename, config_text, {encoding: 'utf8'});
                resolve(true);
            } catch (err) {
                reject(new error.ConfigurationError(err.message));
            }
        });
    },

    /**
     * @param   {Object}  host
     * @param   {Boolean} [throw_errors]
     * @returns {Promise}
     */
    deleteConfig: (host, throw_errors) => {
        return new Promise((resolve, reject) => {
            try {
                fs.unlinkSync(internalNginx.getConfigName(host));
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
