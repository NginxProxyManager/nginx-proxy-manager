import batchflow from "batchflow";
import dnsPlugins from "../certbot/dns-plugins.json" with { type: "json" };
import { certbot as logger } from "../logger.js";
import errs from "./error.js";
import utils from "./utils.js";

const CERTBOT_VERSION_REPLACEMENT = "$(certbot --version | grep -Eo '[0-9](\\.[0-9]+)+')";

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

	plugin.version = plugin.version.replace(/{{certbot-version}}/g, CERTBOT_VERSION_REPLACEMENT);
	plugin.dependencies = plugin.dependencies.replace(/{{certbot-version}}/g, CERTBOT_VERSION_REPLACEMENT);

	// SETUPTOOLS_USE_DISTUTILS is required for certbot plugins to install correctly
	// in new versions of Python
	let env = Object.assign({}, process.env, { SETUPTOOLS_USE_DISTUTILS: "stdlib" });
	if (typeof plugin.env === "object") {
		env = Object.assign(env, plugin.env);
	}

	const cmd = `. /opt/certbot/bin/activate && pip install --no-cache-dir ${plugin.dependencies} ${plugin.package_name}${plugin.version}  && deactivate`;
	return utils
		.exec(cmd, { env })
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
					reject(
						new errs.CommandError("Some plugins failed to install. Please check the logs above", 1),
					);
				} else {
					resolve();
				}
			});
	});
};

export { installPlugins, installPlugin };
