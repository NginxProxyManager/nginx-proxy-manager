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
        if (!date) {
            return '';
        }
        
        if (typeof date === 'number') {
            return moment.unix(date).format(format);
        }

        // Handle various date string formats from database
        const parsedDate = moment(date);
        if (!parsedDate.isValid()) {
            // Try parsing as ISO date
            const isoDate = moment(date, moment.ISO_8601);
            if (isoDate.isValid()) {
                return isoDate.format(format);
            }
            // If still invalid, return the original string or empty
            return date.toString() || '';
        }

        return parsedDate.format(format);
    }
};
