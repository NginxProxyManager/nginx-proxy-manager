'use strict';

const fs                  = require('fs');
const NodeRSA             = require('node-rsa');
const config              = require('config');
const logger              = require('./logger').global;
const userModel           = require('./models/user');
const userPermissionModel = require('./models/user_permission');
const authModel           = require('./models/auth');

module.exports = function () {
    return new Promise((resolve, reject) => {
        // Now go and check if the jwt gpg keys have been created and if not, create them
        if (!config.has('jwt') || !config.has('jwt.key') || !config.has('jwt.pub')) {
            logger.info('Creating a new JWT key pair...');

            // jwt keys are not configured properly
            const filename  = config.util.getEnv('NODE_CONFIG_DIR') + '/' + (config.util.getEnv('NODE_ENV') || 'default') + '.json';
            let config_data = {};

            try {
                config_data = require(filename);
            } catch (err) {
                // do nothing
            }

            // Now create the keys and save them in the config.
            let key = new NodeRSA({b: 2048});
            key.generateKeyPair();

            config_data.jwt = {
                key: key.exportKey('private').toString(),
                pub: key.exportKey('public').toString()
            };

            // Write config
            fs.writeFile(filename, JSON.stringify(config_data, null, 2), (err) => {
                if (err) {
                    logger.error('Could not write JWT key pair to config file: ' + filename);
                    reject(err);
                } else {
                    logger.info('Wrote JWT key pair to config file: ' + filename);
                    config.util.loadFileConfigs();
                    resolve();
                }
            });
        } else {
            // JWT key pair exists
            resolve();
        }
    })
        .then(() => {
            return userModel
                .query()
                .select(userModel.raw('COUNT(`id`) as `count`'))
                .where('is_deleted', 0)
                .first('count')
                .then(row => {
                    if (!row.count) {
                        // Create a new user and set password
                        logger.info('Creating a new user: admin@example.com with password: changeme');

                        let data = {
                            is_deleted: 0,
                            email:      'admin@example.com',
                            name:       'Administrator',
                            nickname:   'Admin',
                            avatar:     '',
                            roles:      ['admin']
                        };

                        return userModel
                            .query()
                            .insertAndFetch(data)
                            .then(user => {
                                return authModel
                                    .query()
                                    .insert({
                                        user_id: user.id,
                                        type:    'password',
                                        secret:  'changeme',
                                        meta:    {}
                                    })
                                    .then(() => {
                                        return userPermissionModel
                                            .query()
                                            .insert({
                                                user_id:           user.id,
                                                visibility:        'all',
                                                proxy_hosts:       'manage',
                                                redirection_hosts: 'manage',
                                                dead_hosts:        'manage',
                                                streams:           'manage',
                                                access_lists:      'manage'
                                            });
                                    });
                            });
                    }
                });
        });
};
