const _ = require("lodash");

module.exports = function() {
	let arr = _.values(arguments);
	arr.unshift('[Backend API]');
	console.log.apply(null, arr);
};
