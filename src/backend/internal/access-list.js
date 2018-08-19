'use strict';

const _                   = require('lodash');
const error               = require('../lib/error');
const accessListModel     = require('../models/access_list');
const accessListAuthModel = require('../models/access_list_auth');
const internalAuditLog    = require('./audit-log');

function omissions () {
    return ['is_deleted'];
}

const internalAccessList = {

    /**
     * @param   {Access}  access
     * @param   {Object}  data
     * @returns {Promise}
     */
    create: (access, data) => {
        return access.can('access_lists:create', data)
            .then(access_data => {
                return accessListModel
                    .query()
                    .omit(omissions())
                    .insertAndFetch({
                        name:          data.name,
                        owner_user_id: access.token.get('attrs').id
                    });
            })
            .then(row => {
                // Now add the items
                let promises = [];
                data.items.map(function (item) {
                    promises.push(accessListAuthModel
                        .query()
                        .insert({
                            access_list_id: row.id,
                            username:       item.username,
                            password:       item.password
                        })
                    );
                });

                return Promise.all(promises);
            })
            .then(row => {
                // re-fetch with cert
                return internalAccessList.get(access, {
                    id:     row.id,
                    expand: ['owner', 'items']
                });
            })
            .then(row => {
                // Audit log
                data.meta = _.assign({}, data.meta || {}, row.meta);

                // Add to audit log
                return internalAuditLog.add(access, {
                    action:      'created',
                    object_type: 'access-list',
                    object_id:   row.id,
                    meta:        data
                })
                    .then(() => {
                        return row;
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
        return access.can('access_lists:update', data.id)
            .then(access_data => {
                // TODO
                return {};
            });
    },

    /**
     * @param  {Access}   access
     * @param  {Object}   data
     * @param  {Integer}  data.id
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

        return access.can('access_lists:get', data.id)
            .then(access_data => {
                let query = accessListModel
                    .query()
                    .where('is_deleted', 0)
                    .andWhere('id', data.id)
                    .allowEager('[owner,items]')
                    .first();

                if (access_data.permission_visibility !== 'all') {
                    query.andWhere('owner_user_id', access.token.get('attrs').id);
                }

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
                    if (typeof row.items !== 'undefined' && row.items) {
                        row = internalAccessList.maskItems(row);
                    }

                    return _.omit(row, omissions());
                } else {
                    throw new error.ItemNotFoundError(data.id);
                }
            });
    },

    /**
     * @param   {Access}  access
     * @param   {Object}  data
     * @param   {Integer} data.id
     * @param   {String}  [data.reason]
     * @returns {Promise}
     */
    delete: (access, data) => {
        return access.can('access_lists:delete', data.id)
            .then(() => {
                return internalAccessList.get(access, {id: data.id});
            })
            .then(row => {
                if (!row) {
                    throw new error.ItemNotFoundError(data.id);
                }

                return accessListModel
                    .query()
                    .where('id', row.id)
                    .patch({
                        is_deleted: 1
                    });
            })
            .then(() => {
                return true;
            });
    },

    /**
     * All Lists
     *
     * @param   {Access}  access
     * @param   {Array}   [expand]
     * @param   {String}  [search_query]
     * @returns {Promise}
     */
    getAll: (access, expand, search_query) => {
        return access.can('access_lists:list')
            .then(access_data => {
                let query = accessListModel
                    .query()
                    .select('access_list.*', accessListModel.raw('COUNT(proxy_hosts.id) as proxy_host_count'), accessListModel.raw('COUNT(items.id) as item_count'))
                    .leftJoinRelation('proxy_hosts')
                    .leftJoinRelation('items')
                    .where('access_list.is_deleted', 0)
                    .groupBy('access_list.id')
                    .omit(['access_list.is_deleted'])
                    .allowEager('[owner,items]')
                    .orderBy('access_list.name', 'ASC');

                if (access_data.permission_visibility !== 'all') {
                    query.andWhere('owner_user_id', access.token.get('attrs').id);
                }

                // Query is used for searching
                if (typeof search_query === 'string') {
                    query.where(function () {
                        this.where('name', 'like', '%' + search_query + '%');
                    });
                }

                if (typeof expand !== 'undefined' && expand !== null) {
                    query.eager('[' + expand.join(', ') + ']');
                }

                return query;
            })
            .then(rows => {
                if (rows) {
                    rows.map(function (row, idx) {
                        if (typeof row.items !== 'undefined' && row.items) {
                            rows[idx] = internalAccessList.maskItems(row);
                        }
                    });
                }

                return rows;
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
        let query = accessListModel
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
    },

    /**
     * @param   {Object}  list
     * @returns {Object}
     */
    maskItems: list => {
        if (list && typeof list.items !== 'undefined') {
            list.items.map(function (val, idx) {
                list.items[idx].hint     = val.password.charAt(0) + ('*').repeat(val.password.length - 1);
                list.items[idx].password = '';
            });
        }

        return list;
    }
};

module.exports = internalAccessList;
