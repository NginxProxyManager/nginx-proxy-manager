import fs from "node:fs";
import errs from "../lib/error.js";
import certificateModel from "../models/certificate.js";
import settingModel from "../models/setting.js";
import internalNginx from "./nginx.js";

/**
 * Build the nginx render context for the default-site setting by
 * resolving its SSL certificate (if any). Returns a NEW object so the
 * underlying row sent back to the API client is not mutated with
 * fields that aren't part of the setting-object schema.
 *
 * @param  {Object} row  The default-site setting row
 * @returns {Promise<Object>} A row-like object with certificate/ssl fields
 */
const buildDefaultSiteRenderContext = async (row) => {
	const certificateId = Number.parseInt(row?.meta?.certificate_id, 10) || 0;
	let certificate = null;
	let ssl_forced = !!row?.meta?.ssl_forced;
	if (certificateId > 0) {
		const cert = await certificateModel
			.query()
			.where("id", certificateId)
			.andWhere("is_deleted", 0)
			.first();
		if (cert) {
			// Drop PEM cert / private-key contents from `meta` before passing
			// to the nginx template. The template renders paths based on
			// `certificate_id` and only reads `certificate.provider`; the PEM
			// material is on disk. Keeping `meta` here would leak the private
			// key into `internalNginx.generateConfig`'s debug log.
			cert.meta = {};
			certificate = cert;
		} else {
			// Certificate doesn't exist anymore, render without SSL
			ssl_forced = false;
		}
	}
	return {
		...row,
		certificate_id: certificate ? certificateId : 0,
		ssl_forced,
		certificate,
	};
};

const internalSetting = {
	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {String}  data.id
	 * @return {Promise}
	 */
	update: (access, data) => {
		return access
			.can("settings:update", data.id)
			.then((/*access_data*/) => {
				return internalSetting.get(access, { id: data.id });
			})
			.then((row) => {
				if (row.id !== data.id) {
					// Sanity check that something crazy hasn't happened
					throw new errs.InternalValidationError(
						`Setting could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
					);
				}

				return settingModel.query().where({ id: data.id }).patch(data);
			})
			.then(() => {
				return internalSetting.get(access, {
					id: data.id,
				});
			})
			.then(async (row) => {
				if (row.id === "default-site") {
					// write the html if we need to
					if (row.value === "html") {
						fs.writeFileSync("/data/nginx/default_www/index.html", row.meta.html, { encoding: "utf8" });
					}

					const renderContext = await buildDefaultSiteRenderContext(row);

					// Configure nginx
					return internalNginx
						.deleteConfig("default")
						.then(() => {
							return internalNginx.generateConfig("default", renderContext);
						})
						.then(() => {
							return internalNginx.test();
						})
						.then(() => {
							return internalNginx.reload();
						})
						.then(() => {
							return row;
						})
						.catch((/*err*/) => {
							internalNginx
								.deleteConfig("default")
								.then(() => {
									return internalNginx.test();
								})
								.then(() => {
									return internalNginx.reload();
								})
								.then(() => {
									// I'm being slack here I know..
									throw new errs.ValidationError("Could not reconfigure Nginx. Please check logs.");
								});
						});
				}
				return row;
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {String}   data.id
	 * @return {Promise}
	 */
	get: (access, data) => {
		return access
			.can("settings:get", data.id)
			.then(() => {
				return settingModel.query().where("id", data.id).first();
			})
			.then((row) => {
				if (row) {
					return row;
				}
				throw new errs.ItemNotFoundError(data.id);
			});
	},

	/**
	 * This will only count the settings
	 *
	 * @param   {Access}  access
	 * @returns {*}
	 */
	getCount: (access) => {
		return access
			.can("settings:list")
			.then(() => {
				return settingModel.query().count("id as count").first();
			})
			.then((row) => {
				return Number.parseInt(row.count, 10);
			});
	},

	/**
	 * All settings
	 *
	 * @param   {Access}  access
	 * @returns {Promise}
	 */
	getAll: (access) => {
		return access.can("settings:list").then(() => {
			return settingModel.query().orderBy("description", "ASC");
		});
	},
};

/**
 * Regenerate the nginx config for the default-site setting based on
 * its current DB state. Intended for callers outside the settings
 * update flow (e.g. certificate.delete) that invalidate the rendered
 * config without touching the setting row.
 *
 * @returns {Promise}
 */
const regenerateDefaultSiteConfig = async () => {
	const row = await settingModel.query().where("id", "default-site").first();
	if (!row) {
		return;
	}
	const renderContext = await buildDefaultSiteRenderContext(row);
	await internalNginx.deleteConfig("default");
	await internalNginx.generateConfig("default", renderContext);
	await internalNginx.reload();
};

export { regenerateDefaultSiteConfig };
export default internalSetting;
