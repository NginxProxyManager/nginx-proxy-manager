import { readFile, rename, rm, writeFile } from "node:fs/promises";
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
	configure: async (model, host_type, host) => {
		let combined_meta = {};

		await internalNginx.deleteConfig(host_type, host);
		await internalNginx.generateConfig(host_type, host);

		try {
			await internalNginx.test();
			combined_meta = _.assign({}, host.meta, {
				nginx_online: true,
				nginx_err: null,
			});

			await model.query().where("id", host.id).patch({
				meta: combined_meta,
			});
		} catch (err) {
			logger.error(err.message);

			// config is bad, update meta and rename config
			combined_meta = _.assign({}, host.meta, {
				nginx_online: false,
				nginx_err: err.message,
			});

			await model.query().where("id", host.id).patch({
				meta: combined_meta,
			});

			await internalNginx.renameConfigAsError(host_type, host);
		}

		await internalNginx.reload();
		return combined_meta;
	},

	/**
	 * @returns {Promise}
	 */
	test: async () => {
		return utils.execFile("nginx", ["-tq"]);
	},

	/**
	 * @returns {Promise}
	 */
	reload: async () => {
		if (process.env.ACME_OCSP_STAPLING === "true") {
			try {
				await utils.execFile("certbot-ocsp-fetcher.sh", [
					"-c",
					"/data/tls/certbot/live",
					"-o",
					"/data/tls/certbot/live",
					"--no-reload-webserver",
					"--quiet",
				]);
			} catch {}
		}

		if (process.env.CUSTOM_OCSP_STAPLING === "true") {
			try {
				await utils.execFile("certbot-ocsp-fetcher.sh", [
					"-c",
					"/data/tls/custom",
					"-o",
					"/data/tls/custom",
					"--no-reload-webserver",
					"--quiet",
				]);
			} catch {}
		}

		await internalNginx.test();
		return utils.execFile("nginx", ["-s", "reload"]);
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
	renderLocations: async (host) => {
		let template;

		try {
			template = await readFile(`${__dirname}/../templates/_proxy_host_custom_location.conf`, {
				encoding: "utf8",
			});
		} catch (err) {
			throw new errs.ConfigurationError(err.message);
		}

		const renderEngine = utils.getRenderEngine();
		let renderedLocations = "";

		for (const location of host.locations) {
			if (location.npmplus_enabled === false) {
				continue;
			}

			if (
				location.forward_host.indexOf("/") > -1 &&
				!location.forward_host.startsWith("/") &&
				!location.forward_host.startsWith("unix")
			) {
				const split = location.forward_host.split("/");

				location.forward_host = split.shift();
				location.forward_path = `/${split.join("/")}`;
			}

			renderedLocations += await renderEngine.parseAndRender(template, location);
		}

		return renderedLocations;
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  host
	 * @returns {Promise}
	 */
	generateConfig: async (host_type, host_row) => {
		// Prevent modifying the original object:
		const host = JSON.parse(JSON.stringify(host_row));
		const nice_host_type = internalNginx.getFileFriendlyHostType(host_type);

		const renderEngine = utils.getRenderEngine();

		let template = null;
		const filename = internalNginx.getConfigName(nice_host_type, host.id);

		try {
			template = await readFile(`${__dirname}/../templates/${nice_host_type}.conf`, { encoding: "utf8" });
		} catch (err) {
			throw new errs.ConfigurationError(err.message);
		}

		// For redirection hosts, if the scheme is not http or https, set it to $scheme
		if (
			nice_host_type === "redirection_host" &&
			["http", "https"].indexOf(host.forward_scheme.toLowerCase()) === -1
		) {
			host.forward_scheme = "$scheme";
		}

		if (host.locations) {
			_.map(host.locations, (location) => {
				if (location.npmplus_auth_request === "anubis") {
					host.create_anubis_locations = true;
				}
				if (location.npmplus_auth_request === "tinyauth") {
					host.create_tinyauth_locations = true;
				}
				if (location.npmplus_auth_request === "authelia") {
					host.create_authelia_locations = true;
				}
				if (
					location.npmplus_auth_request === "authentik" ||
					location.npmplus_auth_request === "authentik-send-basic-auth"
				) {
					host.create_authentik_locations = true;
				}
			});

			host.locations = await internalNginx.renderLocations(host);
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

		try {
			const config_text = await renderEngine.parseAndRender(template, host);

			await writeFile(filename, config_text, { encoding: "utf8" });
			debug(logger, "Wrote config:", filename);

			if (process.env.DISABLE_NGINX_BEAUTIFIER === "false") {
				await utils.execFile("nginxbeautifier", ["-s", "4", filename]).catch(() => {});
			}

			return true;
		} catch (err) {
			debug(logger, `Could not write ${filename}:`, err.message);
			throw new errs.ConfigurationError(err.message);
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
	deleteConfig: async (host_type, host) => {
		const config_file = internalNginx.getConfigName(
			internalNginx.getFileFriendlyHostType(host_type),
			typeof host === "undefined" ? 0 : host.id,
		);

		const filesToDelete = [config_file, `${config_file}.err`];

		for (const filename of filesToDelete) {
			try {
				debug(logger, `Deleting file: ${filename}`);
				await rm(filename, { force: true });
			} catch (err) {
				debug(logger, "Could not delete file:", JSON.stringify(err, null, 2));
			}
		}
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  [host]
	 * @returns {Promise}
	 */
	renameConfigAsError: async (host_type, host) => {
		const config_file = internalNginx.getConfigName(
			internalNginx.getFileFriendlyHostType(host_type),
			typeof host === "undefined" ? 0 : host.id,
		);

		try {
			await rename(config_file, `${config_file}.err`);
		} catch {}
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
};

export default internalNginx;
