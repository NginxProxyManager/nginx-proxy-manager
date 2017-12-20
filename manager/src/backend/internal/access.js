'use strict';

const _             = require('lodash');
const fs            = require('fs');
const batchflow     = require('batchflow');
const db            = require('../db');
const logger        = require('../logger');
const internalNginx = require('./nginx');
const utils         = require('../lib/utils');

const internalAccess = {

    /**
     * All Access Lists
     *
     * @returns {Promise}
     */
    getAll: () => {
        return new Promise((resolve/*, reject*/) => {
            resolve(db.access.find());
        })
            .then(list => {
                _.map(list, (list_item, idx) => {
                    list[idx]       = internalAccess.maskItems(list_item);
                    list[idx].hosts = db.hosts.find({access_list_id: list_item._id});
                });

                return list;
            });
    },

    /**
     * Specific Access List
     *
     * @param   {String}  id
     * @returns {Promise}
     */
    get: id => {
        return new Promise((resolve/*, reject*/) => {
            resolve(db.access.findOne({_id: id}));
        })
            .then(list => {
                if (list) {
                    return internalAccess.maskItems(list);
                }

                list.hosts = db.hosts.find({access_list_id: list._id});

                return list;
            });
    },

    /**
     * Create a Access List
     *
     * @param   {Object} payload
     * @returns {Promise}
     */
    create: payload => {
        return new Promise((resolve/*, reject*/) => {
            // Add list to db
            resolve(db.access.save(payload));
        })
            .then(list => {
                return internalAccess.build(list)
                    .then(() => {
                        return internalAccess.maskItems(list);
                    });
            });
    },

    /**
     * Update a Access List
     *
     * @param   {String} id
     * @param   {Object} payload
     * @returns {Promise}
     */
    update: (id, payload) => {
        return new Promise((resolve, reject) => {
            // get existing list
            let list = db.access.findOne({_id: id});

            if (!list) {
                reject(new error.ValidationError('Access List not found'));
            } else {

                if (typeof payload.name !== 'undefined') {
                    list.name = payload.name;
                }

                if (typeof payload.items !== 'undefined') {
                    // go through each of the items in the payload and assess how they apply to the original items
                    let new_items = [];
                    _.map(payload.items, (payload_item) => {
                        if (!payload_item.password) {
                            // try to find original item and use the password from there, this is essentially keeping existing users
                            let old = _.find(list.items, {username: payload_item.username});
                            if (old) {
                                new_items.push(old);
                            }
                        } else {
                            new_items.push(payload_item);
                        }
                    });

                    list.items = new_items;
                }

                db.access.update({_id: id}, list, {multi: false, upsert: false});
                resolve(list);
            }
        })
            .then(list => {
                return internalAccess.build(list)
                    .then(() => {
                        return internalAccess.maskItems(list);
                    });
            });
    },

    /**
     * Deletes a Access List
     *
     * @param   {String}  id
     * @returns {Promise}
     */
    delete: id => {
        const internalHost   = require('./host');
        let associated_hosts = db.hosts.find({access_list_id: id});

        return new Promise((resolve/*, reject*/) => {
            db.hosts.update({access_list_id: id}, {access_list_id: ''}, {multi: true, upsert: false});

            if (associated_hosts.length) {
                // regenerate config for these hosts
                let promises = [];

                _.map(associated_hosts, associated_host => {
                    promises.push(internalHost.configure(db.hosts.findOne({_id: associated_host._id})));
                });

                resolve(Promise.all(promises));
            } else {
                resolve();
            }
        })
            .then(() => {
                // restart nginx
                if (associated_hosts.length) {
                    return internalNginx.reload();
                }
            })
            .then(() => {
                db.access.remove({_id: id}, false);

                // delete access file
                try {
                    fs.unlinkSync(internalAccess.getFilename(id));
                } catch (err) {
                    // do nothing
                }

                return true;
            });
    },

    /**
     * @param   {Object}  list
     * @returns {Object}
     */
    maskItems: list => {
        if (list && typeof list.items !== 'undefined') {
            _.map(list.items, (val, idx) => {
                list.items[idx].hint     = val.password.charAt(0) + ('*').repeat(val.password.length - 1);
                list.items[idx].password = '';
            });
        }

        return list;
    },

    /**
     * @param   {String|Object}  list
     * @returns {String}
     */
    getFilename: (list) => {
        return '/config/access/' + (typeof list === 'string' ? list : list._id);
    },

    /**
     * @param   {Object}  list
     * @returns {Promise}
     */
    build: list => {
        logger.info('Building Access file for: ' + list.name);

        return new Promise((resolve, reject) => {
            if (typeof list._id !== 'undefined') {

                let htpasswd_file = internalAccess.getFilename(list);

                // 1. remove any existing access file
                try {
                    fs.unlinkSync(htpasswd_file);
                } catch (err) {
                    // do nothing
                }

                // 2. create empty access file
                try {
                    fs.writeFileSync(htpasswd_file, '', {encoding: 'utf8'});
                    resolve(htpasswd_file);
                } catch (err) {
                    reject(err);
                }
            } else {
                reject(new Error('List does not have an _id'));
            }
        })
            .then(htpasswd_file => {
                // 3. generate password for each user
                if (list.items.length) {
                    return new Promise((resolve, reject) => {
                        batchflow(list.items).sequential()
                            .each((i, item, next) => {
                                if (typeof item.password !== 'undefined' && item.password.length) {
                                    logger.info('Adding: ' + item.username);

                                    utils.exec('/usr/bin/htpasswd -b "' + htpasswd_file + '" "' + item.username + '" "' + item.password + '"')
                                        .then((/*result*/) => {
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
                                logger.info('Built Access file for: ' + list.name);
                                resolve(results);
                            });
                    });
                }
            })
            .then(() => {
                // only reload nginx if any hosts are using this access
                let hosts = db.hosts.find({access_list_id: list._id});
                if (hosts && hosts.length) {
                    return internalNginx.reload();
                }
            });
    }
};

module.exports = internalAccess;
