import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import openIDClientConfigModel from "../models/sso_client_openid.js";
import samlClientConfigModel from "../models/sso_client_saml.js";
import ssoClientModel, { SingleSignOnClientType } from "../models/sso_client.js";
import internalAuditLog from "./audit-log.js";

const omissions = () => {
	return [
		"is_deleted",
		"owner.is_deleted",
		"configuration_openid.id",
		"configuration_openid.sso_client_id",
		"configuration_openid.meta",
		"configuration_saml.id",
		"configuration_saml.sso_client_id",
		"configuration_saml.meta",
	];
};

const internalSsoClientConfig = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		const create_client = data?.id === "new";

		if (create_client && data?.id) {
			delete data.id;
		}

		return access
			.can("settings:update", data)
			.then((/*access_data*/) => {
				data.owner_user_id = access.token.getUserId(1);
				if (typeof data.meta === "undefined") {
					data.meta = {};
				}

				// Detach type specific config and save in next phase
				const client = structuredClone(data);
				const config = client.configuration;
				delete client.configuration;

				return ssoClientModel
					.query()
					.insertAndFetch(client)
					.then(utils.omitRow(omissions()))
					.then((row) => [row, config]);
			})
			.then(([row, config]) => {
				config.sso_client_id = row.id;
				switch (row.client_type) {
					case SingleSignOnClientType.OpenID:
						config.redirect_url = (config.redirect_url || "").replace("{id}", row.id);
						return openIDClientConfigModel
							.query()
							.insertAndFetch(config)
							.then(() => row);
					case SingleSignOnClientType.SAML:
						return samlClientConfigModel
							.query()
							.insertAndFetch(config)
							.then(() => row);
					default:
						throw errs.InternalValidationError("Unknown SSO Client client_type");
				}
			})
			.then((row) => {
				const expand = row.client_type === "SAML" ? ["configuration_saml"] : ["configuration_openid"];
				// Re-fetch with config
				return internalSsoClientConfig.get(access, { id: row.id, expand });
			})
			.then((row) => {
				// Don't leave sensitive info in the audit trail
				if (data.configuration?.client_secret) {
					data.configuration.client_secret = "**************";
				}
				// Add to audit log
				return internalAuditLog
					.add(access, {
						action: "created",
						object_type: "sso-client",
						object_id: row.id,
						meta: { ...data },
					})
					.then(() => row);
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @return {Promise}
	 */
	update: (access, data) => {
		const thisData = data;
		const thisConfig = data.configuration;

		return access
			.can("settings:update", thisData.id)
			.then((/*access_data*/) => {
				return internalSsoClientConfig.get(access, { id: thisData.id });
			})
			.then((row) => {
				if (row.id !== thisData.id) {
					// Sanity check that something crazy hasn't happened
					throw new errs.InternalValidationError(
						`SSO Client could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
					);
				}

				return row;
			})
			.then((row) => {
				const config = thisData.configuration;
				delete thisData.configuration;
				return ssoClientModel
					.query()
					.patchAndFetchById(row.id, thisData)
					.then(utils.omitRow(omissions()))
					.then((row) => [row, config]);
			})
			.then(([row, config]) => {
				// only update secrets when value provided in request
				if ("client_secret" in config && config.client_secret === "") {
					delete config.client_secret;
				}
				// update type specific configuration
				switch (row.client_type) {
					case SingleSignOnClientType.OpenID:
						return openIDClientConfigModel
							.query()
							.where({ sso_client_id: row.id })
							.patch(config)
							.then(() => row);
					case SingleSignOnClientType.SAML:
						return samlClientConfigModel
							.query()
							.where({ sso_client_id: row.id })
							.patch(config)
							.then(() => row);
					default:
						throw errs.InternalValidationError("Unknown SSO Client client_type");
				}
			})
			.then((row) => {
				const expand = row.client_type === "SAML" ? ["configuration_saml"] : ["configuration_openid"];
				return internalSsoClientConfig.get(access, { id: row.id, expand });
			})
			.then((saved_row) => {
				// remove sensitive info
				if ("client_secret" in saved_row.configuration) {
					saved_row.configuration.client_secret = thisConfig.client_secret ? "****************" : "";
				}
				// Add to audit log
				return internalAuditLog
					.add(access, {
						action: "updated",
						object_type: "sso-client",
						object_id: thisData.id,
						meta: { ...saved_row },
					})
					.then(() => {
						return saved_row;
					});
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: (access, data) => {
		const thisData = data || {};
		return access
			.can("settings:get", thisData.id)
			.then((access_data) => {
				const query = ssoClientModel.query().where("is_deleted", 0).andWhere("id", thisData.id).first();

				if (access_data.permission_visibility !== "all") {
					query.andWhere("owner_user_id", access.token.getUserId(1));
				}

				if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
					query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
				}

				return query.then(utils.omitRow(omissions()));
			})
			.then((row) => {
				const thisRow = row;
				if (!thisRow?.id) {
					throw new errs.ItemNotFoundError(thisData.id);
				}

				// The API only sends the name of the Client Secret's field w/o the value
				if (thisRow.configuration_openid?.client_secret) {
					thisRow.configuration_openid.client_secret = "";
				}
				// Custom omissions
				if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
					return _.omit(thisRow, thisData.omit);
				}

				thisRow.configuration = thisRow.configuration_openid || thisRow.configuration_saml;
				delete thisRow.configuration_saml;
				delete thisRow.configuration_openid;

				return thisRow;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: (access, data) => {
		return access
			.can("settings:update", data.id)
			.then(() => {
				return internalSsoClientConfig.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}

				return ssoClientModel
					.query()
					.where("id", row.id)
					.patch({
						is_deleted: 1,
					})
					.then(() => {
						// Remove configuration values when the SSO Client is soft deleted
						switch (row.client_type) {
							case SingleSignOnClientType.OpenID:
								return openIDClientConfigModel
									.query()
									.where({ sso_client_id: row.id })
									.patch({ client_id: "", client_secret: "", configuration_url: "" })
									.then(() => row);
							case SingleSignOnClientType.SAML:
								return samlClientConfigModel
									.query()
									.where({ sso_client_id: row.id })
									.patch({ saml_endpoint: "" })
									.then(() => row);
							default:
								throw errs.InternalValidationError("Unknown SSO Client client_type");
						}
					})
					.then((row) => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "deleted",
							object_type: "sso-client",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	enable: (access, data) => {
		return access
			.can("settings:update", data.id)
			.then(() => {
				return internalSsoClientConfig.get(access, {
					id: data.id,
				});
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (row.enabled) {
					throw new errs.ValidationError("SSO Client is already enabled");
				}

				row.enabled = 1;

				return ssoClientModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 1,
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "enabled",
							object_type: "sso-client",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	disable: (access, data) => {
		return access
			.can("settings:update", data.id)
			.then(() => {
				return internalSsoClientConfig.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (!row.enabled) {
					throw new errs.ValidationError("SSO Client is already disabled");
				}

				row.enabled = 0;

				return ssoClientModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 0,
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "disabled",
							object_type: "sso-client",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * All Streams
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: (access, _expand, search_query) => {
		return access.can("streams:list").then((/*access_data*/) => {
			const query = ssoClientModel.query().where("is_deleted", 0).groupBy("id").orderBy("name", "ASC");

			// Query is used for searching
			if (typeof search_query === "string" && search_query.length > 0) {
				query.where(function () {
					this.where(castJsonIfNeed("name"), "like", `%${search_query}%`);
				});
			}

			return query.then(utils.omitRows(omissions()));
		});
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: (user_id, visibility) => {
		const query = ssoClientModel.query().count("id AS count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}

		return query.first().then((row) => {
			return Number.parseInt(row.count, 10);
		});
	},
};

export default internalSsoClientConfig;
