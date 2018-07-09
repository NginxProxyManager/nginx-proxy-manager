'use strict';

const _              = require('lodash');
const error          = require('../lib/error');
const proxyHostModel = require('../models/proxy_host');

function omissions () {
    return ['is_deleted'];
}

const internalProxyHost = {

    /**
     * @param   {Access}  access
     * @param   {Object}  data
     * @returns {Promise}
     */
    create: (access, data) => {
        let auth = data.auth || null;
        delete data.auth;

        data.avatar = data.avatar || '';
        data.roles  = data.roles || [];

        if (typeof data.is_disabled !== 'undefined') {
            data.is_disabled = data.is_disabled ? 1 : 0;
        }

        return access.can('proxy_hosts:create', data)
            .then(() => {
                data.avatar = gravatar.url(data.email, {default: 'mm'});

                return userModel
                    .query()
                    .omit(omissions())
                    .insertAndFetch(data);
            })
            .then(user => {
                if (auth) {
                    return authModel
                        .query()
                        .insert({
                            user_id: user.id,
                            type:    auth.type,
                            secret:  auth.secret,
                            meta:    {}
                        })
                        .then(() => {
                            return user;
                        });
                } else {
                    return user;
                }
            })
            .then(user => {
                // Create permissions row as well
                let is_admin = data.roles.indexOf('admin') !== -1;

                return userPermissionModel
                    .query()
                    .insert({
                        user_id:           user.id,
                        visibility:        is_admin ? 'all' : 'user',
                        proxy_hosts:       'manage',
                        redirection_hosts: 'manage',
                        dead_hosts:        'manage',
                        streams:           'manage',
                        access_lists:      'manage'
                    })
                    .then(() => {
                        return internalProxyHost.get(access, {id: user.id, expand: ['permissions']});
                    });
            });
    },

    /**
     * @param  {Access}  access
     * @param  {Object}  data
     * @param  {Integer} data.id
     * @param  {String}  [data.email]
     * @param  {String}  [data.name]
     * @return {Promise}
     */
    update: (access, data) => {
        if (typeof data.is_disabled !== 'undefined') {
            data.is_disabled = data.is_disabled ? 1 : 0;
        }

        return access.can('proxy_hosts:update', data.id)
            .then(() => {

                // Make sure that the user being updated doesn't change their email to another user that is already using it
                // 1. get user we want to update
                return internalProxyHost.get(access, {id: data.id})
                    .then(user => {

                        // 2. if email is to be changed, find other users with that email
                        if (typeof data.email !== 'undefined') {
                            data.email = data.email.toLowerCase().trim();

                            if (user.email !== data.email) {
                                return internalProxyHost.isEmailAvailable(data.email, data.id)
                                    .then(available => {
                                        if (!available) {
                                            throw new error.ValidationError('Email address already in use - ' + data.email);
                                        }

                                        return user;
                                    });
                            }
                        }

                        // No change to email:
                        return user;
                    });
            })
            .then(user => {
                if (user.id !== data.id) {
                    // Sanity check that something crazy hasn't happened
                    throw new error.InternalValidationError('User could not be updated, IDs do not match: ' + user.id + ' !== ' + data.id);
                }

                data.avatar = gravatar.url(data.email || user.email, {default: 'mm'});

                return userModel
                    .query()
                    .omit(omissions())
                    .patchAndFetchById(user.id, data)
                    .then(saved_user => {
                        return _.omit(saved_user, omissions());
                    });
            })
            .then(() => {
                return internalProxyHost.get(access, {id: data.id});
            });
    },

    /**
     * @param  {Access}   access
     * @param  {Object}   [data]
     * @param  {Integer}  [data.id]          Defaults to the token user
     * @param  {Array}    [data.expand]
     * @param  {Array}    [data.omit]
     * @return {Promise}
     */
    get: (access, data) => {
        if (typeof data === 'undefined') {
            data = {};
        }

        if (typeof data.id === 'undefined' || !data.id) {
            data.id = access.token.get('attrs').id;
        }

        return access.can('proxy_hosts:get', data.id)
            .then(() => {
                let query = userModel
                    .query()
                    .where('is_deleted', 0)
                    .andWhere('id', data.id)
                    .allowEager('[permissions]')
                    .first();

                // Custom omissions
                if (typeof data.omit !== 'undefined' && data.omit !== null) {
                    query.omit(data.omit);
                }

                if (typeof data.expand !== 'undefined' && data.expand !== null) {
                    query.eager('[' + data.expand.join(', ') + ']');
                }

                return query;
            })
            .then(row => {
                if (row) {
                    return _.omit(row, omissions());
                } else {
                    throw new error.ItemNotFoundError(data.id);
                }
            });
    },

    /**
     * @param {Access}  access
     * @param {Object}  data
     * @param {Integer} data.id
     * @param {String}  [data.reason]
     * @returns {Promise}
     */
    delete: (access, data) => {
        return access.can('proxy_hosts:delete', data.id)
            .then(() => {
                return internalProxyHost.get(access, {id: data.id});
            })
            .then(user => {
                if (!user) {
                    throw new error.ItemNotFoundError(data.id);
                }

                // Make sure user can't delete themselves
                if (user.id === access.token.get('attrs').id) {
                    throw new error.PermissionError('You cannot delete yourself.');
                }

                return userModel
                    .query()
                    .where('id', user.id)
                    .patch({
                        is_deleted: 1
                    });
            })
            .then(() => {
                return true;
            });
    },

    /**
     * All Hosts
     *
     * @param   {Access}  access
     * @param   {Array}   [expand]
     * @param   {String}  [search_query]
     * @returns {Promise}
     */
    getAll: (access, expand, search_query) => {
        return access.can('proxy_hosts:list')
            .then(access_data => {
                let query = proxyHostModel
                    .query()
                    .where('is_deleted', 0)
                    .groupBy('id')
                    .omit(['is_deleted'])
                    .orderBy('domain_name', 'ASC');

                if (access_data.permission_visibility !== 'all') {
                    query.andWhere('owner_user_id', access.token.get('attrs').id);
                }

                // Query is used for searching
                if (typeof search_query === 'string') {
                    query.where(function () {
                        this.where('domain_name', 'like', '%' + search_query + '%');
                    });
                }

                if (typeof expand !== 'undefined' && expand !== null) {
                    query.eager('[' + expand.join(', ') + ']');
                }

                return query;
            });
    },

    /**
     * Report use
     *
     * @param   {Integer} user_id
     * @param   {String}  visibility
     * @returns {Promise}
     */
    getCount: (user_id, visibility) => {
        let query = proxyHostModel
            .query()
            .count('id as count')
            .where('is_deleted', 0);

        if (visibility !== 'all') {
            query.andWhere('owner_user_id', user_id);
        }

        return query.first()
            .then(row => {
                return parseInt(row.count, 10);
            });
    }
};

module.exports = internalProxyHost;
