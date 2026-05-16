import fs from "node:fs";
import errs from "../lib/error.js";
import certificateModel from "../models/certificate.js";
import settingModel from "../models/setting.js";
import internalNginx from "./nginx.js";

/**
 * For the default-site setting, fetch the related SSL certificate
 * (if any) and attach it so the nginx template can render an HTTPS
 * server block.
 *
 * @param  {Object} row  The default-site setting row
 * @returns {Promise}
 */
const expandDefaultSiteCertificate = async (row) => {
	if (row?.id !== "default-site") {
		return row;
	}
	const certificateId = Number.parseInt(row?.meta?.certificate_id, 10) || 0;
	row.certificate_id = certificateId;
	row.ssl_forced = !!row?.meta?.ssl_forced;
	row.certificate = null;
	if (certificateId > 0) {
		const cert = await certificateModel
			.query()
			.where("id", certificateId)
			.andWhere("is_deleted", 0)
			.first();
		if (cert) {
			row.certificate = cert;
		} else {
			// Certificate doesn't exist anymore, reset to no SSL
			row.certificate_id = 0;
			row.ssl_forced = false;
		}
	}
	return row;
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

					await expandDefaultSiteCertificate(row);

					// Configure nginx
					return internalNginx
						.deleteConfig("default")
						.then(() => {
							return internalNginx.generateConfig("default", row);
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

export default internalSetting;
