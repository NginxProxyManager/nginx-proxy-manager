const _          = require('lodash');
const exec       = require('node:child_process').exec;
const execFile   = require('node:child_process').execFile;
const { Liquid } = require('liquidjs');
const logger     = require('../logger').global;
const error      = require('./error');
const spawn      = require('child_process').spawn;

module.exports = {

	exec: async (cmd, options = {}) => {
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
	 * @param   {Object|undefined}  options
	 * @returns {Promise}
	 */
	execFile: (cmd, args, options) => {
		logger.debug(`CMD: ${cmd} ${args ? args.join(' ') : ''}`);
		if (typeof options === 'undefined') {
			options = {};
		}

		return new Promise((resolve, reject) => {
			execFile(cmd, args, options, (err, stdout, stderr) => {
				if (err && typeof err === 'object') {
					reject(new error.CommandError(stderr, 1, err));
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
	omitRow: (omissions) => {
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
	omitRows: (omissions) => {
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
	getRenderEngine: () => {
		const renderEngine = new Liquid({
			root: `${__dirname}/../templates/`
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
