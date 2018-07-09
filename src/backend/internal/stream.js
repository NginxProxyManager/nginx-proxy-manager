'use strict';

const _           = require('lodash');
const error       = require('../lib/error');
const streamModel = require('../models/stream');

function omissions () {
    return ['is_deleted'];
}

const internalStream = {

    /**
     * All Hosts
     *
     * @param   {Access}  access
     * @param   {Array}   [expand]
     * @param   {String}  [search_query]
     * @returns {Promise}
     */
    getAll: (access, expand, search_query) => {
        return access.can('streams:list')
            .then(access_data => {
                let query = streamModel
                    .query()
                    .where('is_deleted', 0)
                    .groupBy('id')
                    .omit(['is_deleted'])
                    .orderBy('incoming_port', 'ASC');

                if (access_data.permission_visibility !== 'all') {
                    query.andWhere('owner_user_id', access.token.get('attrs').id);
                }

                // Query is used for searching
                if (typeof search_query === 'string') {
                    query.where(function () {
                        this.where('incoming_port', 'like', '%' + search_query + '%');
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
        let query = streamModel
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

module.exports = internalStream;
