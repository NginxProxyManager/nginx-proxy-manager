const _          = require('lodash');
const exec       = require('child_process').exec;
const execFile   = require('child_process').execFile;
const { Liquid } = require('liquidjs');
const logger     = require('../logger').global;
const error      = require('./error');

module.exports = {

	exec: async function(cmd, options = {}) {
		logger.debug('CMD:', cmd);

		const { stdout, stderr } = await new Promise((resolve, reject) => {
			const child = exec(cmd, options, (isError, stdout, stderr) => {
				if (isError) {
					reject(new error.CommandError(stderr, isError));
				} else {
					resolve({ stdout, stderr });
				}
			});

			child.on('error', (e) => {
				reject(new error.CommandError(stderr, 1, e));
			});
		});
		return stdout;
	},

	/**
	 * @param   {String} cmd
	 * @param   {Array}  args
	 * @returns {Promise}
	 */
	execFile: function (cmd, args) {
		// logger.debug('CMD: ' + cmd + ' ' + (args ? args.join(' ') : ''));

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
				return `${v.directive} ${v.address};`;
			}
			return '';
		});

		return renderEngine;
	}
};
