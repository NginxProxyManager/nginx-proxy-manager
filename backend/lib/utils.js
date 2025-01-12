const _ = require('lodash');
const fs = require('fs');
const crypto = require('crypto');
const execFile = require('child_process').execFile;
const { Liquid } = require('liquidjs');
const logger = require('../logger').global;
const error = require('./error');

module.exports = {
	writeHash: function () {
		const envVars = fs.readdirSync('/app/templates').flatMap((file) => {
			const content = fs.readFileSync('/app/templates/' + file, 'utf8');
			const matches = content.match(/env\.[A-Z0-9_]+/g) || [];
			return matches.map((match) => match.replace('env.', ''));
		});
		const uniqueEnvVars =
			[...new Set(envVars)]
				.sort()
				.map((varName) => process.env[varName])
				.join('') + process.env.TV;
		const hash = crypto.createHash('sha512').update(uniqueEnvVars).digest('hex');
		fs.writeFileSync('/data/npmplus/env.sha512sum', hash);
	},

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
			root: '/app/templates/',
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
