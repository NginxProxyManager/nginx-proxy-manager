const logger  = require('./logger');
const restler = require('@jc21/restler');

const BackendApi = function(config, token) {
	this.config = config;
	this.token  = token;
};

/**
 * @param {string} token
 */
BackendApi.prototype.setToken = function(token) {
	this.token = token;
};

/**
 * @param {string} path
 * @param {bool}   [returnOnError]
 * @returns {Promise<object>}
 */
BackendApi.prototype.get = function(path, returnOnError) {
	return new Promise((resolve, reject) => {
		let headers = {
			Accept: 'application/json'
		};
		if (this.token) {
			headers.Authorization = 'Bearer ' + this.token;
		}

		logger('GET ', this.config.baseUrl + path);

		restler
			.get(this.config.baseUrl + path, {
				headers: headers,
			})
			.on('complete', function(data, response) {
				logger('Response data:', data);
				if (!returnOnError && data instanceof Error) {
					reject(data);
				} else if (!returnOnError && response.statusCode != 200) {
					if (typeof data === 'object' && typeof data.error === 'object' && typeof data.error.message !== 'undefined') {
						reject(new Error(data.error.code + ': ' + data.error.message));
					} else {
						reject(new Error('Error ' + response.statusCode));
					}
				} else {
					resolve(data);
				}
			});
	});
};

/**
 * @param {string} path
 * @param {bool}   [returnOnError]
 * @returns {Promise<object>}
 */
BackendApi.prototype.delete = function(path, returnOnError) {
	return new Promise((resolve, reject) => {
		let headers = {
			Accept: 'application/json'
		};
		if (this.token) {
			headers.Authorization = 'Bearer ' + this.token;
		}

		logger('DELETE ', this.config.baseUrl + path);

		restler
			.del(this.config.baseUrl + path, {
				headers: headers,
			})
			.on('complete', function(data, response) {
				logger('Response data:', data);
				if (!returnOnError && data instanceof Error) {
					reject(data);
				} else if (!returnOnError && response.statusCode != 200) {
					if (typeof data === 'object' && typeof data.error === 'object' && typeof data.error.message !== 'undefined') {
						reject(new Error(data.error.code + ': ' + data.error.message));
					} else {
						reject(new Error('Error ' + response.statusCode));
					}
				} else {
					resolve(data);
				}
			});
	});
};

/**
 * @param {string} path
 * @param {object} data
 * @param {bool}   [returnOnError]
 * @returns {Promise<object>}
 */
BackendApi.prototype.postJson = function(path, data, returnOnError) {
	logger('POST ', this.config.baseUrl + path);
	return this._putPostJson('postJson', path, data, returnOnError);
};

/**
 * @param {string} path
 * @param {object} data
 * @param {bool}   [returnOnError]
 * @returns {Promise<object>}
 */
BackendApi.prototype.putJson = function(path, data, returnOnError) {
	logger('PUT ', this.config.baseUrl + path);
	return this._putPostJson('putJson', path, data, returnOnError);
};

/**
 * @param {string} path
 * @param {object} data
 * @param {bool}   [returnOnError]
 * @returns {Promise<object>}
 */
BackendApi.prototype._putPostJson = function(fn, path, data, returnOnError) {
	return new Promise((resolve, reject) => {
		restler[fn](this.config.baseUrl + path, data, {
			headers: {
				Accept:        'application/json',
				Authorization: 'Bearer ' + this.token,
			},
		}).on('complete', function(data, response) {
			logger('Response data:', data);
			if (!returnOnError && data instanceof Error) {
				reject(data);
			} else if (!returnOnError && response.statusCode != 200) {
				if (typeof data === 'object' && typeof data.error === 'object' && typeof data.error.message !== 'undefined') {
					reject(new Error(data.error.code + ': ' + data.error.message));
				} else {
					reject(new Error('Error ' + response.statusCode));
				}
			} else {
				resolve(data);
			}
		});
	});
};

module.exports = BackendApi;
