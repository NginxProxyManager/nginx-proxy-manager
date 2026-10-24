const logger = require('./logger');
const Client = require('./client');

module.exports = function (config) {
	const backendConfig = Object.assign({}, config, {
		baseUrl: config.env.backendApiUrl || config.baseUrl,
	});

	logger('Client Ready using', backendConfig.baseUrl);
	const clientFor = (options) => new Client(Object.assign({}, backendConfig, {
		baseUrl: options.baseUrl || backendConfig.baseUrl,
	}));

	return {

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
