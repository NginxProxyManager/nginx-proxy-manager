const numeral = require('numeral');
const moment  = require('moment');

module.exports = {

    /**
     * @param   {Integer} number
     * @returns {String}
     */
    niceNumber: function (number) {
        return numeral(number).format('0,0');
    },

    /**
     * @param   {String|Number} date
     * @param   {String}        format
     * @returns {String}
     */
    formatDbDate: function (date, format) {
        if (typeof date === 'number') {
            return moment.unix(date).format(format);
        }

        return moment(date).format(format);
    }
};
