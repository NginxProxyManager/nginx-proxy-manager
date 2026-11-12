import fs from "node:fs";
import errs from "../lib/error.js";
import settingModel from "../models/setting.js";
import internalNginx from "./nginx.js";
import internalTrafficStats from "./traffic-stats.js";

// Never send stored secrets (eg. the InfluxDB token) back out through the API
const maskSecrets = (row) => {
	if (row.id === internalTrafficStats.SETTING_ID) {
		row.meta = internalTrafficStats.maskMeta(row.meta);
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
		let previousRow = null;
		return access
			.can("settings:update", data.id)
			.then((/*access_data*/) => {
				return internalSetting.get(access, { id: data.id });
			})
			.then(async (row) => {
				if (row.id !== data.id) {
					// Sanity check that something crazy hasn't happened
					throw new errs.InternalValidationError(
						`Setting could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
					);
				}

				if (row.id === internalTrafficStats.SETTING_ID) {
					// the row from get() has its secrets masked, so compare against the stored one
					previousRow = await settingModel.query().where({ id: data.id }).first();
					if (data.meta) {
						data.meta = internalTrafficStats.normalizeMeta(data.meta, previousRow.meta);
					}
				}

				return settingModel.query().where({ id: data.id }).patch(data);
			})
			.then(() => {
				return internalSetting.get(access, {
					id: data.id,
				});
			})
			.then((row) => {
				if (row.id === "default-site") {
					// write the html if we need to
					if (row.value === "html") {
						fs.writeFileSync("/data/nginx/default_www/index.html", row.meta.html, { encoding: "utf8" });
					}

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
				if (row.id === internalTrafficStats.SETTING_ID) {
					// settingModel row is re-read unmasked here so the worker gets the real token
					return settingModel
						.query()
						.where({ id: row.id })
						.first()
						.then((raw) => internalTrafficStats.apply(raw, previousRow))
						.then(() => row);
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
					return maskSecrets(row);
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
			return settingModel
				.query()
				.orderBy("description", "ASC")
				.then((rows) => rows.map(maskSecrets));
		});
	},
};

export default internalSetting;
