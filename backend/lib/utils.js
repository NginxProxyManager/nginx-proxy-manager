const _          = require('lodash');
const exec       = require('child_process').exec;
const execFile   = require('child_process').execFile;
const { Liquid } = require('liquidjs');
const logger     = require('../logger').global;
const spawn      = require('child_process').spawn;

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
	 * Run the given command. Safer than using exec since args are passed as a list instead of in shell mode as a single string.
	 * @param {string} cmd The command to run
	 * @param {string} args The args to pass to the command
	 * @returns Promise that resolves to stdout or an object with error code and stderr if there's an error
	 */
	execSafe: (cmd, args) => {
		return new Promise((resolve, reject) => {
			let stdout = '';
			let stderr = '';
			const proc = spawn(cmd, args);
			proc.stdout.on('data', (data) => {
				stdout += data;
			});
			proc.stderr.on('data', (data) => {
				stderr += data;
			});

			proc.on('close', (exitCode) => {
				if (!exitCode) {
					resolve(stdout.trim());
				} else {
					reject({
						exitCode: exitCode,
						stderr:   stderr
					});
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
	},

	/**
	 * Used in objection query builder
	 *
	 * @param   {Array}  omissions
	 * @returns {Function}
	 */
	omitRow: function (omissions) {
		/**
		 * @param   {Object} row
		 * @returns {Object}
		 */
		return (row) => {
			return _.omit(row, omissions);
		};
	},

	/**
	 * Used in objection query builder
	 *
	 * @param   {Array}  omissions
	 * @returns {Function}
	 */
	omitRows: function (omissions) {
		/**
		 * @param   {Array} rows
		 * @returns {Object}
		 */
		return (rows) => {
			rows.forEach((row, idx) => {
				rows[idx] = _.omit(row, omissions);
			});
			return rows;
		};
	},

	/**
	 * @returns {Object} Liquid render engine
	 */
	getRenderEngine: function () {
		const renderEngine = new Liquid({
			root: __dirname + '/../templates/'
		});

		/**
		 * nginxAccessRule expects the object given to have 2 properties:
		 *
		 * directive  string
		 * address    string
		 */
		renderEngine.registerFilter('nginxAccessRule', (v) => {
			if (typeof v.directive !== 'undefined' && typeof v.address !== 'undefined' && v.directive && v.address) {
				if (typeof v.resolvedAddress !== 'undefined' && v.resolvedAddress) {
					return `${v.directive} ${v.resolvedAddress}; # ${v.address}`;
				}
				return `${v.directive} ${v.address};`;
			}
			return '';
		});

		return renderEngine;
	}
};
