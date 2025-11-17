import batchflow from "batchflow";
import dnsPlugins from "../certbot/dns-plugins.json" with { type: "json" };
import { certbot as logger } from "../logger.js";
import errs from "./error.js";
import utils from "./utils.js";

/**
 * Installs a cerbot plugin given the key for the object from
 * ../certbot/dns-plugins.json
 *
 * @param   {string}  pluginKey
 * @returns {Object}
 */
const installPlugin = async (pluginKey) => {
	if (typeof dnsPlugins[pluginKey] === "undefined") {
		// throw Error(`Certbot plugin ${pluginKey} not found`);
		throw new errs.ItemNotFoundError(pluginKey);
	}

	const plugin = dnsPlugins[pluginKey];
	logger.start(`Installing ${pluginKey}...`);

	return utils
		.execFile("pip", ["install", "--upgrade", "--no-cache-dir", plugin.package_name])
		.then((result) => {
			logger.complete(`Installed ${pluginKey}`);
			return result;
		})
		.catch((err) => {
			throw err;
		});
};

/**
 * @param {array} pluginKeys
 */
const installPlugins = async (pluginKeys) => {
	let hasErrors = false;

	return new Promise((resolve, reject) => {
		if (pluginKeys.length === 0) {
			resolve();
			return;
		}

		batchflow(pluginKeys)
			.sequential()
			.each((_i, pluginKey, next) => {
				installPlugin(pluginKey)
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
					reject(new errs.CommandError("Some plugins failed to install. Please check the logs above", 1));
				} else {
					resolve();
				}
			});
	});
};

export { installPlugins, installPlugin };
