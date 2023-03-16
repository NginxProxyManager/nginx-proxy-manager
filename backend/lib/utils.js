const exec     = require('child_process').exec;
const execFile = require('child_process').execFile;
const logger   = require('../logger').global;

module.exports = {

	/**
	 * @param   {String} cmd
	 * @returns {Promise}
	 */
	exec: function (cmd) {
		return new Promise((resolve, reject) => {
			exec(cmd, function (err, stdout, /*stderr*/) {
				if (err && typeof err === 'object') {
					reject(err);
				} else {
					resolve(stdout.trim());
				}
			});
		});
	},

	/**
	 * @param   {String} cmd
	 * @param   {Array}  args
	 * @returns {Promise}
	 */
	execFile: function (cmd, args) {
		logger.debug('CMD: ' + cmd + ' ' + (args ? args.join(' ') : ''));
		return new Promise((resolve, reject) => {
			execFile(cmd, args, function (err, stdout, /*stderr*/) {
				if (err && typeof err === 'object') {
					reject(err);
				} else {
					resolve(stdout.trim());
				}
			});
		});
	}
};
