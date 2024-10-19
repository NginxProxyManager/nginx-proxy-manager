const dnsPlugins = require('../certbot-dns-plugins.json');
const utils = require('./utils');
const error = require('./error');
const logger = require('../logger').certbot;
const batchflow = require('batchflow');

const certbot = {
	/**
	 * @param {array} pluginKeys
	 */
	installPlugins: async function (pluginKeys) {
		let hasErrors = false;

		return new Promise((resolve, reject) => {
			if (pluginKeys.length === 0) {
				resolve();
				return;
			}

			batchflow(pluginKeys)
				.sequential()
				.each((i, pluginKey, next) => {
					certbot
						.installPlugin(pluginKey)
						.then(() => {
							next();
						})
						.catch((err) => {
							hasErrors = true;
							next(err);
						});
				})
				.error((err) => {
					logger.error(err.message);
				})
				.end(() => {
					if (hasErrors) {
						reject(new error.CommandError('Some plugins failed to install. Please check the logs above', 1));
					} else {
						resolve();
					}
				});
		});
	},

	/**
	 * Installs a cerbot plugin given the key for the object from
	 * ../global/certbot-dns-plugins.json
	 *
	 * @param   {string}  pluginKey
	 * @returns {Object}
	 */
	installPlugin: async function (pluginKey) {
		if (typeof dnsPlugins[pluginKey] === 'undefined') {
			// throw Error(`Certbot plugin ${pluginKey} not found`);
			throw new error.ItemNotFoundError(pluginKey);
		}

		const plugin = dnsPlugins[pluginKey];
		logger.start(`Installing ${pluginKey}...`);

		return utils
			.execFile('pip', ['install', '--upgrade', '--no-cache-dir', plugin.package_name])
			.then((result) => {
				logger.complete(`Installed ${pluginKey}`);
				return result;
			})
			.catch((err) => {
				throw err;
			});
	},
};

module.exports = certbot;
