const _ = require('lodash');
const spawn = require('child_process').spawn;
const execFile = require('child_process').execFile;
const { Liquid } = require('liquidjs');
const logger = require('../logger').global;
const error = require('./error');

module.exports = {
	/**
	 * @param   {String} cmd
	 * @param   {Array}  args
	 */
	execFile: async function (cmd, args, options = {}) {
		logger.debug('CMD: ' + cmd + ' ' + (args ? args.join(' ') : ''));
		const { stdout, stderr } = await new Promise((resolve, reject) => {
			const child = execFile(cmd, args, options, (isError, stdout, stderr) => {
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
	 */
	execfg: function (cmd, args) {
		return new Promise((resolve, reject) => {
			const childProcess = spawn(cmd, args, {
				shell: true,
				detached: true,
				stdio: 'inherit',
			});

			childProcess.on('error', (err) => {
				reject(err);
			});

			childProcess.on('close', (code) => {
				if (code !== 0) {
					reject(new Error(`Command '${cmd}' exited with code ${code}`));
				} else {
					resolve();
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
			root: __dirname + '/../templates/',
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
	},
};
