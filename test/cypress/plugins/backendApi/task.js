const fs     = require('fs');
const FormData = require('form-data');
const logger = require('./logger');
const Client = require('./client');

module.exports = function (config) {
	logger('Client Ready using', config.baseUrl);

	return {

		/**
		 * @param   {object}    options
		 * @param   {string}    options.path         API path
		 * @param   {string}    [options.token]      JWT
		 * @param   {bool}      [options.returnOnError] If true, will return instead of throwing errors
		 * @returns {string}
		 */
		backendApiGet: (options) => {
			const api = new Client(config);
			api.setToken(options.token);
			return api.request('get', options.path, options.returnOnError || false);
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
			const api = new Client(config);
			api.setToken(options.token);
			return api.request('post', options.path, options.returnOnError || false, options.data);
		},

		/**
		 * @param   {object}    options
		 * @param   {string}    options.token        JWT
		 * @param   {string}    options.path         API path
		 * @param   {object}    options.files
		 * @param   {bool}      [options.returnOnError] If true, will return instead of throwing errors
		 * @returns {string}
		 */
		backendApiPostFiles: (options) => {
			const api = new Client(config);
			api.setToken(options.token);

			const form = new FormData();
			for (let [key, value] of Object.entries(options.files)) {
				form.append(key, fs.createReadStream(config.fixturesFolder + '/' + value));
			}
			return api.postForm(options.path, form, options.returnOnError || false);
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
			const api = new Client(config);
			api.setToken(options.token);
			return api.request('put', options.path, options.returnOnError || false, options.data);
		},

		/**
		 * @param   {object}    options
		 * @param   {string}    options.token        JWT
		 * @param   {string}    options.path         API path
		 * @param   {bool}      [options.returnOnError] If true, will return instead of throwing errors
		 * @returns {string}
		 */
		backendApiDelete: (options) => {
			const api = new Client(config);
			api.setToken(options.token);
			return api.request('delete', options.path, options.returnOnError || false);
		}
	};
};
