import fs from "node:fs";
import { installPlugins } from "./lib/certbot.js";
import utils from "./lib/utils.js";
import internalNginx from "./internal/nginx.js";
import { setup as logger } from "./logger.js";
import authModel from "./models/auth.js";
import certificateModel from "./models/certificate.js";
import deadHostModel from "./models/dead_host.js";
import proxyHostModel from "./models/proxy_host.js";
import redirectionHostModel from "./models/redirection_host.js";
import settingModel from "./models/setting.js";
import streamModel from "./models/stream.js";
import upstreamHostModel from "./models/upstream_host.js";
import userModel from "./models/user.js";
import userPermissionModel from "./models/user_permission.js";

export const isSetup = async () => {
	const row = await userModel.query().select("id").where("is_deleted", 0).first();
	return row?.id > 0;
}

/**
 * Creates a default admin users if one doesn't already exist in the database
 *
 * @returns {Promise}
 */
const setupDefaultUser = async () => {
	const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL;
	const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;

	// This will only create a new user when there are no active users in the database
	// and the INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD environment variables are set.
	// Otherwise, users should be shown the setup wizard in the frontend.
	// I'm keeping this legacy behavior in case some people are automating deployments.

	if (!initialAdminEmail || !initialAdminPassword) {
		return Promise.resolve();
	}

	const userIsetup = await isSetup();
	if (!userIsetup) {
		// Create a new user and set password
		logger.info(`Creating a new user: ${initialAdminEmail} with password: ${initialAdminPassword}`);

		const data = {
			is_deleted: 0,
			email: initialAdminEmail,
			name: "Administrator",
			nickname: "Admin",
			avatar: "",
			roles: ["admin"],
		};

		const user = await userModel
			.query()
			.insertAndFetch(data);

		await authModel
			.query()
			.insert({
				user_id: user.id,
				type: "password",
				secret: initialAdminPassword,
				meta: {},
			});

		await userPermissionModel.query().insert({
			user_id: user.id,
			visibility: "all",
			proxy_hosts: "manage",
			redirection_hosts: "manage",
			dead_hosts: "manage",
			streams: "manage",
			access_lists: "manage",
			certificates: "manage",
			upstream_hosts: "manage",
		});
		logger.info("Initial admin setup completed");
	}
};

/**
 * Creates default settings if they don't already exist in the database
 *
 * @returns {Promise}
 */
const setupDefaultSettings = async () => {
	const row = await settingModel
		.query()
		.select("id")
		.where({ id: "default-site" })
		.first();

	if (!row?.id) {
		await settingModel
			.query()
			.insert({
				id: "default-site",
				name: "Default Site",
				description: "What to show when Nginx is hit with an unknown Host",
				value: "congratulations",
				meta: {},
			});
		logger.info("Default settings added");
	}

	const ipRow = await settingModel.query().select("id").where({ id: "real-ip-header" }).first();
	if (!ipRow?.id) {
		await settingModel.query().insert({
			id: "real-ip-header",
			name: "Real IP Header",
			description: "HTTP header used to determine the real client IP address",
			value: "X-Real-IP",
			meta: {},
		});
		logger.info("Default real-ip-header setting added");
	}
};

/**
 * Installs all Certbot plugins which are required for an installed certificate
 *
 * @returns {Promise}
 */
const setupCertbotPlugins = async () => {
	const certificates = await certificateModel
		.query()
		.where("is_deleted", 0)
		.andWhere("provider", "letsencrypt");

	if (certificates?.length) {
		const plugins = [];
		const promises = [];

		certificates.map((certificate) => {
			if (certificate.meta && certificate.meta.dns_challenge === true) {
				if (plugins.indexOf(certificate.meta.dns_provider) === -1) {
					plugins.push(certificate.meta.dns_provider);
				}

				// Make sure credentials file exists
				const credentials_loc = `/etc/letsencrypt/credentials/credentials-${certificate.id}`;
				// Escape single quotes and backslashes
				if (typeof certificate.meta.dns_provider_credentials === "string") {
					const escapedCredentials = certificate.meta.dns_provider_credentials
						.replaceAll("'", "\\'")
						.replaceAll("\\", "\\\\");
					const credentials_cmd = `[ -f '${credentials_loc}' ] || { mkdir -p /etc/letsencrypt/credentials 2> /dev/null; echo '${escapedCredentials}' > '${credentials_loc}' && chmod 600 '${credentials_loc}'; }`;
					promises.push(utils.exec(credentials_cmd));
				}
			}
			return true;
		});

		await installPlugins(plugins);

		if (promises.length) {
			await Promise.all(promises);
			logger.info(`Added Certbot plugins ${plugins.join(", ")}`);
		}
	}
};

/**
 * Deletes all generated nginx host config files and regenerates them
 * from current templates. This ensures configs on disk always match
 * the current template version after an upgrade.
 *
 * @returns {Promise}
 */
const setupNginxConfigs = async () => {
	const hostTypes = [
		{ model: upstreamHostModel, type: "upstream_host", noEnabledFilter: true },
		{ model: proxyHostModel, type: "proxy_host" },
		{ model: redirectionHostModel, type: "redirection_host" },
		{ model: deadHostModel, type: "dead_host" },
		{ model: streamModel, type: "stream" },
	];

	// Delete all existing host config files so stale configs don't
	// block nginx from starting (e.g. after a template change)
	for (const { type } of hostTypes) {
		const dir = `/data/nginx/${type}`;
		if (fs.existsSync(dir)) {
			for (const file of fs.readdirSync(dir)) {
				if (file.endsWith(".conf") || file.endsWith(".conf.err")) {
					fs.unlinkSync(`${dir}/${file}`);
				}
			}
		}
	}

	// Regenerate configs for all enabled hosts
	for (const { model, type, noEnabledFilter } of hostTypes) {
		const query = model
			.query()
			.where("is_deleted", 0);
		if (!noEnabledFilter) {
			query.andWhere("enabled", 1);
		}
		const rows = await query
			.groupBy("id")
			.allowGraph(model.defaultAllowGraph)
			.withGraphFetched(`[${model.defaultExpand.join(", ")}]`)
			.orderBy(...model.defaultOrder);

		for (const row of rows) {
			try {
				await internalNginx.generateConfig(type, row);
			} catch (err) {
				logger.warn(`Failed to generate ${type} config #${row.id}: ${err.message}`);
			}
		}

		if (rows.length) {
			logger.info(`Regenerated ${rows.length} ${type} config(s)`);
		}
	}

	// Reload nginx to pick up the fresh configs
	try {
		await internalNginx.reload();
	} catch (err) {
		logger.warn(`Nginx reload after config regeneration failed: ${err.message}`);
	}
};

/**
 * Starts a timer to call run the logrotation binary every two days
 * @returns {Promise}
 */
const setupLogrotation = () => {
	const intervalTimeout = 1000 * 60 * 60 * 24 * 2; // 2 days

	const runLogrotate = async () => {
		try {
			await utils.exec("logrotate /etc/logrotate.d/nginx-proxy-manager");
			logger.info("Logrotate completed.");
		} catch (e) {
			logger.warn(e);
		}
	};

	logger.info("Logrotate Timer initialized");
	setInterval(runLogrotate, intervalTimeout);
	// And do this now as well
	return runLogrotate();
};

export default () => setupDefaultUser().then(setupDefaultSettings).then(setupCertbotPlugins).then(setupNginxConfigs).then(setupLogrotation);
