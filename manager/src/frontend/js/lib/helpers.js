'use strict';

import numeral from 'numeral';
import moment from 'moment';

module.exports = {

    /**
     * @param {Integer} number
     * @returns {String}
     */
    niceNumber: function (number) {
        return numeral(number).format('0,0');
    },

    /**
     * @param   {String} date
     * @returns {String}
     */
    shortTime: function (date) {
        let shorttime = '';

        if (typeof date === 'number') {
            shorttime = moment.unix(date).format('H:mm A');
        } else {
            shorttime = moment(date).format('H:mm A');
        }

        return shorttime;
    }

};
