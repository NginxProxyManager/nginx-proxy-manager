import fs from "node:fs";
import { dirname } from "node:path";
import { domainToASCII, fileURLToPath } from "node:url";
import _ from "lodash";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { debug, nginx as logger } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const internalNginx = {
	/**
	 * This will:
	 * - test the nginx config first to make sure it's OK
	 * - create / recreate the config for the host
	 * - test again
	 * - IF OK:  update the meta with online status
	 * - IF BAD: update the meta with offline status and rename the config
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
			.test()
			.then(() => {
				return internalNginx.deleteConfig(host_type, host);
			})
			.then(() => {
				return internalNginx.reload();
			})
			.then(() => {
				return internalNginx.generateConfig(host_type, host);
			})
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

						return model.query().where("id", host.id).patch({
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
							.where("id", host.id)
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
		return utils.execFile("nginx", ["-tq"]);
	},

	/**
	 * @returns {Promise}
	 */
	reload: () => {
		const promises = [];

		if (process.env.ACME_OCSP_STAPLING === "true") {
			promises.push(
				utils
					.execFile("certbot-ocsp-fetcher.sh", [
						"-c",
						"/data/tls/certbot/live",
						"-o",
						"/data/tls/certbot/live",
						"--no-reload-webserver",
						"--quiet",
					])
					.catch(() => {}),
			);
		}

		if (process.env.CUSTOM_OCSP_STAPLING === "true") {
			promises.push(
				utils
					.execFile("certbot-ocsp-fetcher.sh", [
						"-c",
						"/data/tls/custom",
						"-o",
						"/data/tls/custom",
						"--no-reload-webserver",
						"--quiet",
					])
					.catch(() => {}),
			);
		}

		return Promise.all(promises).finally(() => {
			return internalNginx.test().then(() => {
				return utils.execFile("nginx", ["-s", "reload"]);
			});
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Integer} host_id
	 * @returns {String}
	 */
	getConfigName: (host_type, host_id) => {
		if (host_type === "default") {
			return "/usr/local/nginx/conf/conf.d/default.conf";
		}
		return `/data/nginx/${internalNginx.getFileFriendlyHostType(host_type)}/${host_id}.conf`;
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
				template = fs.readFileSync(`${__dirname}/../templates/_proxy_host_custom_location.conf`, {
					encoding: "utf8",
				});
			} catch (err) {
				reject(new errs.ConfigurationError(err.message));
				return;
			}

			const renderEngine = utils.getRenderEngine();
			let renderedLocations = "";

			const locationRendering = async () => {
				for (let i = 0; i < host.locations.length; i++) {
					if (
						host.locations[i].forward_host.indexOf("/") > -1 &&
						!host.locations[i].forward_host.startsWith("/") &&
						!host.locations[i].forward_host.startsWith("unix")
					) {
						const split = host.locations[i].forward_host.split("/");

						host.locations[i].forward_host = split.shift();
						host.locations[i].forward_path = `/${split.join("/")}`;
					}

					renderedLocations += await renderEngine.parseAndRender(template, host.locations[i]);
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
		const host = JSON.parse(JSON.stringify(host_row));
		const nice_host_type = internalNginx.getFileFriendlyHostType(host_type);

		const renderEngine = utils.getRenderEngine();

		return new Promise((resolve, reject) => {
			let template = null;
			const filename = internalNginx.getConfigName(nice_host_type, host.id);

			try {
				template = fs.readFileSync(`${__dirname}/../templates/${nice_host_type}.conf`, { encoding: "utf8" });
			} catch (err) {
				reject(new errs.ConfigurationError(err.message));
				return;
			}

			let locationsPromise;
			let origLocations;

			// Manipulate the data a bit before sending it to the template
			if (nice_host_type !== "default") {
				host.use_default_location = true;
				if (typeof host.advanced_config !== "undefined" && host.advanced_config) {
					host.use_default_location = !internalNginx.advancedConfigHasDefaultLocation(host.advanced_config);
				}
			}

			// For redirection hosts, if the scheme is not http or https, set it to $scheme
			if (
				nice_host_type === "redirection_host" &&
				["http", "https"].indexOf(host.forward_scheme.toLowerCase()) === -1
			) {
				host.forward_scheme = "$scheme";
			}

			if (host.locations) {
				//logger.info ('host.locations = ' + JSON.stringify(host.locations, null, 2));
				origLocations = [].concat(host.locations);
				locationsPromise = internalNginx.renderLocations(host).then((renderedLocations) => {
					host.locations = renderedLocations;
				});

				// Allow someone who is using / custom location path to use it, and skip the default / location
				_.map(host.locations, (location) => {
					if (location.path === "/" && location.location_type !== "= ") {
						host.use_default_location = false;
					}
				});
			} else {
				locationsPromise = Promise.resolve();
			}

			if (
				host.forward_host &&
				host.forward_host.indexOf("/") > -1 &&
				!host.forward_host.startsWith("/") &&
				!host.forward_host.startsWith("unix")
			) {
				const split = host.forward_host.split("/");

				host.forward_host = split.shift();
				host.forward_path = `/${split.join("/")}`;
			}

			if (host.domain_names) {
				host.server_names = host.domain_names.map((domain_name) => domainToASCII(domain_name) || domain_name);
			}

			host.env = process.env;

			locationsPromise.then(() => {
				renderEngine
					.parseAndRender(template, host)
					.then((config_text) => {
						fs.writeFileSync(filename, config_text, { encoding: "utf8" });
						debug(logger, "Wrote config:", filename);

						// Restore locations array
						host.locations = origLocations;

						resolve(true);
					})
					.catch((err) => {
						debug(logger, `Could not write ${filename}:`, err.message);
						reject(new errs.ConfigurationError(err.message));
					})
					.then(() => {
						if (process.env.DISABLE_NGINX_BEAUTIFIER === "false") {
							utils.execFile("nginxbeautifier", ["-s", "4", filename]).catch(() => {});
						}
					});
			});
		});
	},

	/**
	 * A simple wrapper around unlinkSync that writes to the logger
	 *
	 * @param   {String}  filename
	 */
	deleteFile: (filename) => {
		if (!fs.existsSync(filename)) {
			return;
		}
		try {
			debug(logger, `Deleting file: ${filename}`);
			fs.unlinkSync(filename);
		} catch (err) {
			debug(logger, "Could not delete file:", JSON.stringify(err, null, 2));
		}
	},

	/**
	 *
	 * @param   {String} host_type
	 * @returns String
	 */
	getFileFriendlyHostType: (host_type) => {
		return host_type.replace(/-/g, "_");
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  [host]
	 * @returns {Promise}
	 */
	deleteConfig: (host_type, host) => {
		const config_file = internalNginx.getConfigName(
			internalNginx.getFileFriendlyHostType(host_type),
			typeof host === "undefined" ? 0 : host.id,
		);

		return new Promise((resolve /*, reject*/) => {
			internalNginx.deleteFile(config_file);
			internalNginx.deleteFile(`${config_file}.err`);
			resolve();
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  [host]
	 * @returns {Promise}
	 */
	renameConfigAsError: (host_type, host) => {
		const config_file = internalNginx.getConfigName(
			internalNginx.getFileFriendlyHostType(host_type),
			typeof host === "undefined" ? 0 : host.id,
		);

		return new Promise((resolve /*, reject */) => {
			fs.rename(config_file, `${config_file}.err`, () => {
				resolve();
			});
		});
	},

	/**
	 * @param   {String}  hostType
	 * @param   {Array}   hosts
	 * @returns {Promise}
	 */
	bulkGenerateConfigs: async (model, hostType, hosts) => {
    const results = [];

    for (const host of hosts) {
        const result = await internalNginx.configure(model, hostType, host);
        results.push(result);
    }

    return results;
},

	/**
	 * @param   {string}  config
	 * @returns {boolean}
	 */
	advancedConfigHasDefaultLocation: (cfg) => !!cfg.match(/^(?:.*;)?\s*?location\s*?\/\s*?{/im),
};

export default internalNginx;
