import fs from "node:fs";
import { installPlugins } from "./lib/certbot.js";
import utils from "./lib/utils.js";
import { setup as logger } from "./logger.js";
import authModel from "./models/auth.js";
import certificateModel from "./models/certificate.js";
import settingModel from "./models/setting.js";
import userModel from "./models/user.js";
import userPermissionModel from "./models/user_permission.js";

import proxyModel from "./models/proxy_host.js";
import redirectionModel from "./models/redirection_host.js";
import deadModel from "./models/dead_host.js";
import streamModel from "./models/stream.js";
import internalNginx from "./internal/nginx.js";

export const isSetup = async () => {
	const row = await userModel.query().select("id").where("is_deleted", 0).first();
	return row?.id > 0;
};

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

		const user = await userModel.query().insertAndFetch(data);

		await authModel.query().insert({
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
	const rowds = await settingModel.query().select("id").where({ id: "default-site" }).first();

	if (!rowds?.id) {
		await settingModel.query().insert({
			id: "default-site",
			name: "Default Site",
			description: "What to show when Nginx is hit with an unknown Host",
			value: process.env.INITIAL_DEFAULT_PAGE,
			meta: {},
		});
		logger.info("Default settings added");
	}
	const rowoidc = await settingModel.query().select("id").where({ id: "oidc-config" }).first();

	if (!rowoidc?.id) {
		await settingModel.query().insert({
			id: "oidc-config",
			name: "Open ID Connect",
			description: "Sign in to NPMplus with an external Identity Provider",
			value: "metadata",
			meta: {},
		});
		logger.info("Added oidc-config setting");
	}
};

/**
 * Installs all Certbot plugins which are required for an installed certificate
 *
 * @returns {Promise}
 */
const setupCertbotPlugins = async () => {
	const certificates = await certificateModel.query().where("is_deleted", 0).andWhere("provider", "letsencrypt");

	if (certificates?.length) {
		const plugins = [];
		const promises = [];

		certificates.map((certificate) => {
			if (certificate.meta && certificate.meta.dns_challenge === true) {
				if (plugins.indexOf(certificate.meta.dns_provider) === -1) {
					plugins.push(certificate.meta.dns_provider);
				}

				fs.writeFileSync(
					`/tmp/certbot-credentials/credentials-${certificate.id}`,
					certificate.meta.dns_provider_credentials,
					{ mode: 0o600 },
				);
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
 * regenerate all hosts if needed
 *
 * @returns {Promise}
 */
const regenerateAllHosts = async () => {
	if (process.env.REGENERATE_ALL === "true") {
		const proxy_hosts = await proxyModel
			.query()
			.where("is_deleted", 0)
			.andWhere("enabled", 1)
			.withGraphFetched("[certificate, access_list.[clients,items]]");

		if (proxy_hosts?.length) {
			internalNginx.bulkGenerateConfigs(proxyModel, "proxy_host", proxy_hosts);
		}

		const redirection_hosts = await redirectionModel
			.query()
			.where("is_deleted", 0)
			.andWhere("enabled", 1)
			.withGraphFetched("[certificate]");

		if (redirection_hosts?.length) {
			internalNginx.bulkGenerateConfigs(redirectionModel, "redirection_host", redirection_hosts);
		}

		const dead_hosts = await deadModel
			.query()
			.where("is_deleted", 0)
			.andWhere("enabled", 1)
			.withGraphFetched("[certificate]");

		if (dead_hosts?.length) {
			internalNginx.bulkGenerateConfigs(deadModel, "proxy_host", dead_hosts);
		}

		const streams = await streamModel
			.query()
			.where("is_deleted", 0)
			.andWhere("enabled", 1)
			.withGraphFetched("[certificate]");

		if (streams?.length) {
			internalNginx.bulkGenerateConfigs(streamModel, "stream", streams);
		}

		utils.writeHash();
	}
};

export default () => setupDefaultUser().then(setupDefaultSettings).then(setupCertbotPlugins).then(regenerateAllHosts);
