'use strict';

const numeral = require('numeral');
const moment  = require('moment');

module.exports = {

    /**
     * @param {Integer} number
     * @returns {String}
     */
    niceNumber: function (number) {
        return numeral(number).format('0,0');
    },

    /**
     * @param   {String|Integer} date
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
    },

    replaceSlackLinks: function (content) {
        return content.replace(/<(http[^|>]+)\|([^>]+)>/gi, '<a href="$1" target="_blank">$2</a>');
    }

};
