const _ = require('lodash');
const fs = require('fs');
const logger = require('../logger').nginx;
const utils = require('../lib/utils');
const error = require('../lib/error');

const internalNginx = {
	/**
	 * This will:
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

		return internalNginx
			.generateConfig(host_type, host)
			.then(() => {
				// Test nginx again and update meta with result
				return internalNginx
					.test()
					.then(() => {
						// nginx is ok
						combined_meta = _.assign({}, host.meta, {
							nginx_online: true,
							nginx_err: null,
						});

						return model.query().where('id', host.id).patch({
							meta: combined_meta,
						});
					})
					.catch((err) => {
						logger.error(err.message);

						// config is bad, update meta and rename config
						combined_meta = _.assign({}, host.meta, {
							nginx_online: false,
							nginx_err: err.message,
						});

						return model
							.query()
							.where('id', host.id)
							.patch({
								meta: combined_meta,
							})
							.then(() => {
								internalNginx.renameConfigAsError(host_type, host);
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
		return utils.execFile('nginx', ['-tq']);
	},

	/**
	 * @returns {Promise}
	 */

	reload: () => {
		const promises = [];

		if (process.env.ACME_OCSP_STAPLING === 'true') {
			promises.push(utils.execFile('certbot-ocsp-fetcher.sh', ['-c', '/data/tls/certbot/live', '-o', '/data/tls/certbot/live', '--no-reload-webserver', '--quiet']).catch(() => {}));
		}

		if (process.env.CUSTOM_OCSP_STAPLING === 'true') {
			promises.push(utils.execFile('certbot-ocsp-fetcher.sh', ['-c', '/data/tls/custom', '-o', '/data/tls/custom', '--no-reload-webserver', '--quiet']).catch(() => {}));
		}

		return Promise.all(promises).finally(() => {
			logger.info('Reloading Nginx');
			return utils.execFile('nginx', ['-s', 'reload']);
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Integer} host_id
	 * @returns {String}
	 */
	getConfigName: (host_type, host_id) => {
		if (host_type === 'default') {
			return '/usr/local/nginx/conf/conf.d/default.conf';
		}
		return '/data/nginx/' + internalNginx.getFileFriendlyHostType(host_type) + '/' + host_id + '.conf';
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
				template = fs.readFileSync('/app/templates/_location.conf', { encoding: 'utf8' });
			} catch (err) {
				reject(new error.ConfigurationError(err.message));
				return;
			}

			const renderEngine = utils.getRenderEngine();
			let renderedLocations = '';

			const locationRendering = async () => {
				for (let i = 0; i < host.locations.length; i++) {
					const locationCopy = Object.assign({}, { access_list_id: host.access_list_id }, { certificate_id: host.certificate_id }, { ssl_forced: host.ssl_forced }, { caching_enabled: host.caching_enabled }, { block_exploits: host.block_exploits }, { allow_websocket_upgrade: host.allow_websocket_upgrade }, { http2_support: host.http2_support }, { hsts_enabled: host.hsts_enabled }, { hsts_subdomains: host.hsts_subdomains }, { access_list: host.access_list }, { certificate: host.certificate }, host.locations[i]);

					if (locationCopy.forward_host.indexOf('/') > -1) {
						const split = locationCopy.forward_host.split('/');

						locationCopy.forward_host = split.shift();
						locationCopy.forward_path = `/${split.join('/')}`;
					}
					locationCopy.env = process.env;

					renderedLocations += await renderEngine.parseAndRender(template, locationCopy);
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
	generateConfig: (host_type, host_row) => {
		// Prevent modifying the original object:
		let host = JSON.parse(JSON.stringify(host_row));
		const nice_host_type = internalNginx.getFileFriendlyHostType(host_type);

		const renderEngine = utils.getRenderEngine();

		return new Promise((resolve, reject) => {
			let template = null;
			const filename = internalNginx.getConfigName(nice_host_type, host.id);

			try {
				template = fs.readFileSync('/app/templates/' + nice_host_type + '.conf', { encoding: 'utf8' });
			} catch (err) {
				reject(new error.ConfigurationError(err.message));
				return;
			}

			let locationsPromise;
			let origLocations;

			// Manipulate the data a bit before sending it to the template
			if (nice_host_type !== 'default') {
				host.use_default_location = true;
				if (typeof host.advanced_config !== 'undefined' && host.advanced_config) {
					host.use_default_location = !internalNginx.advancedConfigHasDefaultLocation(host.advanced_config);
				}
			}

			if (host.locations) {
				// logger.info ('host.locations = ' + JSON.stringify(host.locations, null, 2));
				origLocations = [].concat(host.locations);
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

			host.env = process.env;

			locationsPromise.then(() => {
				renderEngine
					.parseAndRender(template, host)
					.then((config_text) => {
						fs.writeFileSync(filename, config_text, { encoding: 'utf8' });

						// Restore locations array
						host.locations = origLocations;

						resolve(true);
					})
					.catch((err) => {
						reject(new error.ConfigurationError(err.message));
					})
					.then(() => {
						if (process.env.DISABLE_NGINX_BEAUTIFIER === 'false') {
							utils.execFile('nginxbeautifier', ['-s', '4', filename]).catch(() => {});
						}
					});
			});
		});
	},

	/**
	 *
	 * @param   {String} host_type
	 * @returns String
	 */
	getFileFriendlyHostType: (host_type) => {
		return host_type.replace(new RegExp('-', 'g'), '_');
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  [host]
	 * @param   {Boolean} [delete_err_file]
	 * @returns {Promise}
	 */
	deleteConfig: (host_type, host) => {
		const config_file = internalNginx.getConfigName(internalNginx.getFileFriendlyHostType(host_type), typeof host === 'undefined' ? 0 : host.id);
		const config_file_err = config_file + '.err';

		return new Promise((resolve /*, reject */) => {
			fs.rm(config_file, { force: true }, () => {
				resolve();
			});
			fs.rm(config_file_err, { force: true }, () => {
				resolve();
			});
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  [host]
	 * @returns {Promise}
	 */
	renameConfigAsError: (host_type, host) => {
		const config_file = internalNginx.getConfigName(internalNginx.getFileFriendlyHostType(host_type), typeof host === 'undefined' ? 0 : host.id);
		const config_file_err = config_file + '.err';

		return new Promise((resolve /*, reject */) => {
			fs.rename(config_file, config_file_err, () => {
				resolve();
			});
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Array}   hosts
	 * @returns {Promise}
	 */
	bulkGenerateConfigs: (model, host_type, hosts) => {
		return hosts.reduce((promise, host) => {
			return promise.then(() => internalNginx.configure(model, host_type, host));
		}, Promise.resolve());
	},

	/**
	 * @param   {string}  config
	 * @returns {boolean}
	 */
	advancedConfigHasDefaultLocation: function (cfg) {
		return !!cfg.match(/^(?:.*;)?\s*?location\s*?\/\s*?{/im);
	},
};

module.exports = internalNginx;
