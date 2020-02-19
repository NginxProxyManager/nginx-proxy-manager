const exec = require('child_process').exec;

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
	}
};
