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
		},

		/**
		 * GET request that returns raw buffer (for file downloads like backup export)
		 * @param   {object}    options
		 * @param   {string}    options.token        JWT
		 * @param   {string}    options.path         API path
		 * @returns {Promise<{data: number[], length: number}>} Buffer data as array (Cypress serialization)
		 */
		backendApiGetBuffer: (options) => {
			const api = new Client(config);
			api.setToken(options.token);
			return api.getBuffer(options.path).then((buffer) => {
				// Convert Buffer to array for Cypress task serialization
				return { data: Array.from(buffer), length: buffer.length };
			});
		},

		/**
		 * POST request with buffer as file upload (for backup import)
		 * @param   {object}    options
		 * @param   {string}    options.token        JWT
		 * @param   {string}    options.path         API path
		 * @param   {number[]}  options.buffer       Buffer data as array
		 * @param   {string}    options.fieldName    Form field name
		 * @param   {string}    options.fileName     File name for upload
		 * @returns {Promise<object>}
		 */
		backendApiPostBuffer: (options) => {
			const api = new Client(config);
			api.setToken(options.token);
			// Convert array back to Buffer
			const buffer = Buffer.from(options.buffer);
			return api.postBuffer(options.path, buffer, options.fieldName, options.fileName);
		}
	};
};
