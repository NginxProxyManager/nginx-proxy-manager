const logger = require('./logger');
const Client = require('./client');
const {execFileSync} = require('node:child_process');

module.exports = function (config) {
	const backendConfig = Object.assign({}, config, {
		baseUrl: config.env.backendApiUrl || config.baseUrl,
	});

	logger('Client Ready using', backendConfig.baseUrl);
	const clientFor = (options) => new Client(Object.assign({}, backendConfig, {
		baseUrl: options.baseUrl || backendConfig.baseUrl,
	}));

	return {
		ssoPostgresAttemptEvidence: () => {
			if (config.env.stack !== 'postgres') return '';
			const sql = `SELECT 'tx',connection_id,id,CASE WHEN consumed_at IS NULL THEN 'open' ELSE 'consumed' END FROM sso_transaction UNION ALL SELECT 'handoff',connection_id,user_id::text,CASE WHEN consumed_at IS NULL THEN 'open' ELSE 'consumed' END FROM sso_handoff UNION ALL SELECT 'session',connection_id,user_id::text,CASE WHEN revoked_at IS NULL THEN 'open' ELSE 'revoked' END FROM session WHERE source='sso' ORDER BY 1,2,3`;
			return execFileSync('docker', ['exec','npm-sso-postgres-postgres-1','psql','-U','npm','-d','npm','-A','-F','\t','-t','-c',sql], {encoding:'utf8'}).trim();
		},

		/**
		 * @param   {object}    options
		 * @param   {string}    options.token        JWT
		 * @param   {string}    options.path         API path
		 * @param   {bool}      [options.returnOnError] If true, will return instead of throwing errors
		 * @returns {string}
		 */
		backendApiGet: (options) => {
			const api = clientFor(options);
			api.setToken(options.token);
			return api.get(options.path, options.returnOnError || false);
		},

		/**
		 * @param   {object}    options
		 * @param   {string}    options.token        JWT
		 * @param   {string}    options.path         API path
		 * @param   {object}    options.data
		 * @param   {bool}      [options.returnOnError] If true, will return instead of throwing errors
		 * @returns {string}
		 */
		backendApiPost: (options) => {
			const api = clientFor(options);
			api.setToken(options.token);
			return api.postJson(options.path, options.data, options.returnOnError || false);
		},

		/**
		 * @param   {object}    options
		 * @param   {string}    options.token        JWT
		 * @param   {string}    options.path         API path
		 * @param   {object}    options.data
		 * @param   {bool}      [options.returnOnError] If true, will return instead of throwing errors
		 * @returns {string}
		 */
		backendApiPut: (options) => {
			const api = clientFor(options);
			api.setToken(options.token);
			return api.putJson(options.path, options.data, options.returnOnError || false);
		},

		/**
		 * @param   {object}    options
		 * @param   {string}    options.token        JWT
		 * @param   {string}    options.path         API path
		 * @param   {bool}      [options.returnOnError] If true, will return instead of throwing errors
		 * @returns {string}
		 */
		backendApiDelete: (options) => {
			const api = clientFor(options);
			api.setToken(options.token);
			return api.delete(options.path, options.returnOnError || false);
		}
	};
};
