'use strict';

const numeral = require('numeral');

module.exports = {

    /**
     * @param   {Integer} number
     * @returns {String}
     */
    niceNumber: function (number) {
        return numeral(number).format('0,0');
    }
};
