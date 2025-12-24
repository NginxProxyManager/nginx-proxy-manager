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
	if (pluginKeys.length === 0) {
		return;
	}

	let hasErrors = false;

	for (const pluginKey of pluginKeys) {
		try {
			await installPlugin(pluginKey);
		} catch (err) {
			hasErrors = true;
			logger.error(err.message);
			break;
		}
	}

	if (hasErrors) {
		throw new errs.CommandError("Some plugins failed to install. Please check the logs above", 1);
	}
};

export { installPlugins, installPlugin };
