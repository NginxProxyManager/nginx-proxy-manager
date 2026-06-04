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
		throw new errs.ItemNotFoundError(pluginKey);
	}

	const plugin = dnsPlugins[pluginKey];
	logger.start(`Installing ${pluginKey}...`);

	plugin.version = plugin.version.replace(/{{certbot-version}}/g, process.env.CERTBOT_VERSION);
	plugin.dependencies = plugin.dependencies.replace(/{{certbot-version}}/g, process.env.CERTBOT_VERSION);

	// SETUPTOOLS_USE_DISTUTILS=local uses setuptools' own bundled distutils.
	// "stdlib" breaks Python 3.13+ where distutils was removed from the standard library.
	let env = Object.assign({}, process.env, { SETUPTOOLS_USE_DISTUTILS: "local" });
	if (typeof plugin.env === "object") {
		env = Object.assign(env, plugin.env);
	}

	const quotedDeps = plugin.dependencies.trim()
		? plugin.dependencies
				.trim()
				.split(/\s+/)
				.filter(Boolean)
				.map((d) => `'${d}'`)
				.join(" ")
		: "";

	const cmd = `. /opt/certbot/bin/activate && pip install --no-cache-dir ${quotedDeps} '${plugin.package_name}${plugin.version}' && deactivate`;
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
					reject(new errs.CommandError("Some plugins failed to install. Please check the logs above", 1));
				} else {
					resolve();
				}
			});
	});
};

export { installPlugin, installPlugins };
