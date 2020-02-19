const _          = require('lodash');
const fs         = require('fs');
const logger     = require('../logger').nginx;
const utils      = require('../lib/utils');
const error      = require('../lib/error');
const { Liquid } = require('liquidjs');
const debug_mode = process.env.NODE_ENV !== 'production' || !!process.env.DEBUG;

const internalNginx = {

	/**
	 * This will:
	 * - test the nginx config first to make sure it's OK
	 * - create / recreate the config for the host
	 * - test again
	 * - IF OK:  update the meta with online status
	 * - IF BAD: update the meta with offline status and remove the config entirely
	 * - then reload nginx
	 *
	 * @param   {Object|String}  model
	 * @param   {String}         host_type
	 * @param   {Object}         host
	 * @returns {Promise}
	 */
	configure: (model, host_type, host) => {
		let combined_meta = {};

		return internalNginx.test()
			.then(() => {
				// Nginx is OK
				// We're deleting this config regardless.
				return internalNginx.deleteConfig(host_type, host); // Don't throw errors, as the file may not exist at all
			})
			.then(() => {
				return internalNginx.generateConfig(host_type, host);
			})
			.then(() => {
				// Test nginx again and update meta with result
				return internalNginx.test()
					.then(() => {
						// nginx is ok
						combined_meta = _.assign({}, host.meta, {
							nginx_online: true,
							nginx_err:    null
						});

						return model
							.query()
							.where('id', host.id)
							.patch({
								meta: combined_meta
							});
					})
					.catch((err) => {
						// Remove the error_log line because it's a docker-ism false positive that doesn't need to be reported.
						// It will always look like this:
						//   nginx: [alert] could not open error log file: open() "/var/log/nginx/error.log" failed (6: No such device or address)

						let valid_lines = [];
						let err_lines   = err.message.split('\n');
						err_lines.map(function (line) {
							if (line.indexOf('/var/log/nginx/error.log') === -1) {
								valid_lines.push(line);
							}
						});

						if (debug_mode) {
							logger.error('Nginx test failed:', valid_lines.join('\n'));
						}

						// config is bad, update meta and delete config
						combined_meta = _.assign({}, host.meta, {
							nginx_online: false,
							nginx_err:    valid_lines.join('\n')
						});

						return model
							.query()
							.where('id', host.id)
							.patch({
								meta: combined_meta
							})
							.then(() => {
								return internalNginx.deleteConfig(host_type, host, true);
							});
					});
			})
			.then(() => {
				return internalNginx.reload();
			})
			.then(() => {
				return combined_meta;
			});
	},

	/**
	 * @returns {Promise}
	 */
	test: () => {
		if (debug_mode) {
			logger.info('Testing Nginx configuration');
		}

		return utils.exec('/usr/sbin/nginx -t -g "error_log off;"');
	},

	/**
	 * @returns {Promise}
	 */
	reload: () => {
		return internalNginx.test()
			.then(() => {
				logger.info('Reloading Nginx');
				return utils.exec('/usr/sbin/nginx -s reload');
			});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Integer} host_id
	 * @returns {String}
	 */
	getConfigName: (host_type, host_id) => {
		host_type = host_type.replace(new RegExp('-', 'g'), '_');

		if (host_type === 'default') {
			return '/data/nginx/default_host/site.conf';
		}

		return '/data/nginx/' + host_type + '/' + host_id + '.conf';
	},

	/**
	 * Generates custom locations
	 * @param   {Object}  host
	 * @returns {Promise}
	 */
	renderLocations: (host) => {
		return new Promise((resolve, reject) => {
			let template;

			try {
				template = fs.readFileSync(__dirname + '/../templates/_location.conf', {encoding: 'utf8'});
			} catch (err) {
				reject(new error.ConfigurationError(err.message));
				return;
			}

			let renderer          = new Liquid();
			let renderedLocations = '';

			const locationRendering = async () => {
				for (let i = 0; i < host.locations.length; i++) {
					let locationCopy = Object.assign({}, host.locations[i]);

					if (locationCopy.forward_host.indexOf('/') > -1) {
						const splitted = locationCopy.forward_host.split('/');

						locationCopy.forward_host = splitted.shift();
						locationCopy.forward_path = `/${splitted.join('/')}`;
					}

					// eslint-disable-next-line
					renderedLocations += await renderer.parseAndRender(template, locationCopy);
				}
			};

			locationRendering().then(() => resolve(renderedLocations));
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  host
	 * @returns {Promise}
	 */
	generateConfig: (host_type, host) => {
		host_type = host_type.replace(new RegExp('-', 'g'), '_');

		if (debug_mode) {
			logger.info('Generating ' + host_type + ' Config:', host);
		}

		let renderEngine = new Liquid({
			root: __dirname + '/../templates/'
		});

		return new Promise((resolve, reject) => {
			let template = null;
			let filename = internalNginx.getConfigName(host_type, host.id);

			try {
				template = fs.readFileSync(__dirname + '/../templates/' + host_type + '.conf', {encoding: 'utf8'});
			} catch (err) {
				reject(new error.ConfigurationError(err.message));
				return;
			}

			let locationsPromise;
			let origLocations;

			// Manipulate the data a bit before sending it to the template
			if (host_type !== 'default') {
				host.use_default_location = true;
				if (typeof host.advanced_config !== 'undefined' && host.advanced_config) {
					host.use_default_location = !internalNginx.advancedConfigHasDefaultLocation(host.advanced_config);
				}
			}

			if (host.locations) {
				origLocations    = [].concat(host.locations);
				locationsPromise = internalNginx.renderLocations(host).then((renderedLocations) => {
					host.locations = renderedLocations;
				});

				// Allow someone who is using / custom location path to use it, and skip the default / location
				_.map(host.locations, (location) => {
					if (location.path === '/') {
						host.use_default_location = false;
					}
				});

			} else {
				locationsPromise = Promise.resolve();
			}

			locationsPromise.then(() => {
				renderEngine
					.parseAndRender(template, host)
					.then((config_text) => {
						fs.writeFileSync(filename, config_text, {encoding: 'utf8'});

						if (debug_mode) {
							logger.success('Wrote config:', filename, config_text);
						}

						// Restore locations array
						host.locations = origLocations;

						resolve(true);
					})
					.catch((err) => {
						if (debug_mode) {
							logger.warn('Could not write ' + filename + ':', err.message);
						}

						reject(new error.ConfigurationError(err.message));
					});
			});
		});
	},

	/**
	 * This generates a temporary nginx config listening on port 80 for the domain names listed
	 * in the certificate setup. It allows the letsencrypt acme challenge to be requested by letsencrypt
	 * when requesting a certificate without having a hostname set up already.
	 *
	 * @param   {Object}  certificate
	 * @returns {Promise}
	 */
	generateLetsEncryptRequestConfig: (certificate) => {
		if (debug_mode) {
			logger.info('Generating LetsEncrypt Request Config:', certificate);
		}

		let renderEngine = new Liquid({
			root: __dirname + '/../templates/'
		});

		return new Promise((resolve, reject) => {
			let template = null;
			let filename = '/data/nginx/temp/letsencrypt_' + certificate.id + '.conf';
			try {
				template = fs.readFileSync(__dirname + '/../templates/letsencrypt-request.conf', {encoding: 'utf8'});
			} catch (err) {
				reject(new error.ConfigurationError(err.message));
				return;
			}

			renderEngine
				.parseAndRender(template, certificate)
				.then((config_text) => {
					fs.writeFileSync(filename, config_text, {encoding: 'utf8'});

					if (debug_mode) {
						logger.success('Wrote config:', filename, config_text);
					}

					resolve(true);
				})
				.catch((err) => {
					if (debug_mode) {
						logger.warn('Could not write ' + filename + ':', err.message);
					}

					reject(new error.ConfigurationError(err.message));
				});
		});
	},

	/**
	 * This removes the temporary nginx config file generated by `generateLetsEncryptRequestConfig`
	 *
	 * @param   {Object}  certificate
	 * @param   {Boolean} [throw_errors]
	 * @returns {Promise}
	 */
	deleteLetsEncryptRequestConfig: (certificate, throw_errors) => {
		return new Promise((resolve, reject) => {
			try {
				let config_file = '/data/nginx/temp/letsencrypt_' + certificate.id + '.conf';

				if (debug_mode) {
					logger.warn('Deleting nginx config: ' + config_file);
				}

				fs.unlinkSync(config_file);
			} catch (err) {
				if (debug_mode) {
					logger.warn('Could not delete config:', err.message);
				}

				if (throw_errors) {
					reject(err);
				}
			}

			resolve();
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  [host]
	 * @param   {Boolean} [throw_errors]
	 * @returns {Promise}
	 */
	deleteConfig: (host_type, host, throw_errors) => {
		host_type = host_type.replace(new RegExp('-', 'g'), '_');

		return new Promise((resolve, reject) => {
			try {
				let config_file = internalNginx.getConfigName(host_type, typeof host === 'undefined' ? 0 : host.id);

				if (debug_mode) {
					logger.warn('Deleting nginx config: ' + config_file);
				}

				fs.unlinkSync(config_file);
			} catch (err) {
				if (debug_mode) {
					logger.warn('Could not delete config:', err.message);
				}

				if (throw_errors) {
					reject(err);
				}
			}

			resolve();
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Array}   hosts
	 * @returns {Promise}
	 */
	bulkGenerateConfigs: (host_type, hosts) => {
		let promises = [];
		hosts.map(function (host) {
			promises.push(internalNginx.generateConfig(host_type, host));
		});

		return Promise.all(promises);
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Array}   hosts
	 * @param   {Boolean} [throw_errors]
	 * @returns {Promise}
	 */
	bulkDeleteConfigs: (host_type, hosts, throw_errors) => {
		let promises = [];
		hosts.map(function (host) {
			promises.push(internalNginx.deleteConfig(host_type, host, throw_errors));
		});

		return Promise.all(promises);
	},

	/**
	 * @param   {string}  config
	 * @returns {boolean}
	 */
	advancedConfigHasDefaultLocation: function (config) {
		return !!config.match(/^(?:.*;)?\s*?location\s*?\/\s*?{/im);
	}
};

module.exports = internalNginx;
