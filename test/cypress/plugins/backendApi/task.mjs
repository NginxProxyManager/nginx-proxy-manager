import fs from "node:fs";
import FormData from "form-data";
import Client from "./client.mjs";
import logger from "./logger.mjs";

export default (config) => {
	logger("Client Ready using", config.baseUrl);

	/**
	 * Posts files and resolves with the status code as well, never throws on http errors
	 *
	 * @param   {string}  token
	 * @param   {string}  path
	 * @param   {object}  files  Form field name => fixture file name
	 * @returns {Promise<{status: number, data: *}>}
	 */
	const postFilesWithStatus = async (token, path, files) => {
		const api = new Client(config);
		const form = new FormData();
		for (const [key, value] of Object.entries(files || {})) {
			form.append(key, fs.createReadStream(`${config.fixturesFolder}/${value}`));
		}
		const headers = { Accept: "application/json", ...form.getHeaders() };
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}
		logger("POST", config.baseUrl + path);
		const response = await api.axios.post(path, form, {
			headers,
			validateStatus: () => true,
		});
		return { status: response.status, data: response.data };
	};

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
			return api.request("get", options.path, options.returnOnError || false);
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
			return api.request(
				"post",
				options.path,
				options.returnOnError || false,
				options.data,
			);
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
			for (const [key, value] of Object.entries(options.files)) {
				form.append(
					key,
					fs.createReadStream(`${config.fixturesFolder}/${value}`),
				);
			}
			return api.postForm(options.path, form, options.returnOnError || false);
		},

		/**
		 * @param   {object}    options
		 * @param   {string}    [options.token]      JWT
		 * @param   {string}    options.path         API path
		 * @param   {object}    [options.files]
		 * @returns {Promise<{status: number, data: *}>}
		 */
		backendApiPostFilesWithStatus: (options) => {
			return postFilesWithStatus(options.token, options.path, options.files);
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
			return api.request(
				"put",
				options.path,
				options.returnOnError || false,
				options.data,
			);
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
			return api.request(
				"delete",
				options.path,
				options.returnOnError || false,
			);
		},
	};
};
