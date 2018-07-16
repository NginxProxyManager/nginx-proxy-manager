'use strict';

const auditLogModel = require('../models/audit-log');

const internalAuditLog = {

    /**
     * Internal use only
     *
     * @param   {Object}  data
     * @returns {Promise}
     */
    create: data => {
        // TODO
    },

    /**
     * All logs
     *
     * @param   {Access}  access
     * @param   {Array}   [expand]
     * @param   {String}  [search_query]
     * @returns {Promise}
     */
    getAll: (access, expand, search_query) => {
        return access.can('auditlog:list')
            .then(() => {
                let query = auditLogModel
                    .query()
                    .orderBy('created_on', 'DESC')
                    .limit(100);

                // Query is used for searching
                if (typeof search_query === 'string') {
                    /*
                    query.where(function () {
                        this.where('name', 'like', '%' + search_query + '%')
                            .orWhere('email', 'like', '%' + search_query + '%');
                    });
                    */
                }

                if (typeof expand !== 'undefined' && expand !== null) {
                    query.eager('[' + expand.join(', ') + ']');
                }

                return query;
            });
    }
};

module.exports = internalAuditLog;
