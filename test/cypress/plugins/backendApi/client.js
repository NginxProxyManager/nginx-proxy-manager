const logger  = require('./logger');
const axios = require('axios').default;

const BackendApi = function(config, token) {
	this.config = config;
	this.token  = token;

	this.axios = axios.create({
		baseURL: config.baseUrl,
		timeout: 90000,
	});
};

/**
 * @param {string} token
 */
BackendApi.prototype.setToken = function(token) {
	this.token = token;
};

/**
 * @param {bool} returnOnError
 */
BackendApi.prototype._prepareOptions = function(returnOnError) {
	let options = {
		headers: {
			Accept: 'application/json'
		}
	}
	if (this.token) {
		options.headers.Authorization = 'Bearer ' + this.token;
	}
	if (returnOnError) {
		options.validateStatus = function () {
			return true;
		}
	}
	return options;
};

/**
 * @param {*} response
 * @param {function} resolve
 * @param {function} reject
 * @param {bool} returnOnError
 */
BackendApi.prototype._handleResponse = function(response, resolve, reject, returnOnError) {
	logger('Response data:', response.data);
	if (!returnOnError && typeof response.data === 'object' && typeof response.data.error === 'object') {
		if (typeof response.data === 'object' && typeof response.data.error === 'object' && typeof response.data.error.message !== 'undefined') {
			reject(new Error(response.data.error.code + ': ' + response.data.error.message));
		} else {
			reject(new Error('Error ' + response.status));
		}
	} else {
		resolve(response.data);
	}
};

/**
 * @param {*} err
 * @param {function} resolve
 * @param {function} reject
 * @param {bool} returnOnError
 */
BackendApi.prototype._handleError = function(err, resolve, reject, returnOnError) {
	logger('Axios Error:', err);
	if (returnOnError) {
		resolve(typeof err.response.data !== 'undefined' ? err.response.data : err);
	} else {
		reject(err);
	}
};

/**
 * @param {string} method
 * @param {string} path
 * @param {bool}   [returnOnError]
 * @param {*}      [data]
 * @returns {Promise<object>}
 */
BackendApi.prototype.request = function (method, path, returnOnError, data) {
	logger(method.toUpperCase(), path);
	const options = this._prepareOptions(returnOnError);

	return new Promise((resolve, reject) => {
		let opts = {
			method: method,
			url: path,
			...options
		}
		if (data !== undefined && data !== null) {
			opts.data = data;
		}

		this.axios(opts)
			.then((response) => {
				this._handleResponse(response, resolve, reject, returnOnError);
			})
			.catch((err) => {
				this._handleError(err, resolve, reject, returnOnError);
			});
	});
};

/**
 * @param {string} path
 * @param {form}   form
 * @param {bool}   [returnOnError]
 * @returns {Promise<object>}
 */
BackendApi.prototype.postForm = function (path, form, returnOnError) {
	logger('POST', this.config.baseUrl + path);
	const options = this._prepareOptions(returnOnError);

	return new Promise((resolve, reject) => {
		const opts = {
			...options,
			...form.getHeaders(),
		}

		this.axios.post(path, form, opts)
			.then((response) => {
				this._handleResponse(response, resolve, reject, returnOnError);
			})
			.catch((err) => {
				this._handleError(err, resolve, reject, returnOnError);
			});
	});
};

module.exports = BackendApi;
