const moment = require('moment');

module.exports = {

	/**
	 * Takes an expression such as 30d and returns a moment object of that date in future
	 *
	 * Key      Shorthand
	 * ==================
	 * years         y
	 * quarters      Q
	 * months        M
	 * weeks         w
	 * days          d
	 * hours         h
	 * minutes       m
	 * seconds       s
	 * milliseconds  ms
	 *
	 * @param {String}  expression
	 * @returns {Object}
	 */
	parseDatePeriod: function (expression) {
		let matches = expression.match(/^([0-9]+)(y|Q|M|w|d|h|m|s|ms)$/m);
		if (matches) {
			return moment().add(matches[1], matches[2]);
		}

		return null;
	}

};
