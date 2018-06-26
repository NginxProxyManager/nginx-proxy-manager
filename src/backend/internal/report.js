'use strict';

const _     = require('lodash');
const error = require('../lib/error');

const internalReport = {

    /**
     * @param  {Access}   access
     * @return {Promise}
     */
    getHostsReport: access => {
        return access.can('reports:hosts', 1)
            .then(() => {
                return {
                    proxy:       12,
                    redirection: 2,
                    stream:      1,
                    '404':       0
                };
            });
    }
};

module.exports = internalReport;
