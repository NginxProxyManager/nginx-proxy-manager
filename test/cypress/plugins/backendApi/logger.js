const _     = require('lodash');
const chalk = require('chalk');

module.exports = function () {
	var arr = _.values(arguments);
	arr.unshift(chalk.blue.bold('[') + chalk.yellow.bold('Backend API') + chalk.blue.bold(']'));
	console.log.apply(null, arr);
};
