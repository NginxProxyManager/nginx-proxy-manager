import _ from "lodash";
import db from "../db.js";
import { encryptRSA } from "../lib/encrypt.js";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import {
	default as SingleSignOnClient,
	SingleSignOnClientType,
	default as ssoClientModel,
} from "../models/sso_client.js";
import auth0ClientConfigModel from "../models/sso_client_auth0.js";
import githubConfigModel from "../models/sso_client_github.js";
import openIDClientConfigModel from "../models/sso_client_openid.js";
import samlClientConfigModel from "../models/sso_client_saml.js";
import internalAuditLog from "./audit-log.js";

const omissions = () => {
	return [
		"is_deleted",
		"owner.is_deleted",
		"configuration_auth0.id",
		"configuration_auth0.sso_client_id",
		"configuration_auth0.meta",
		"configuration_openid.id",
		"configuration_openid.sso_client_id",
		"configuration_openid.meta",
		"configuration_github.id",
		"configuration_github.sso_client_id",
		"configuration_github.meta",
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
					case SingleSignOnClientType.Auth0:
						config.redirect_url = (config.redirect_url || "").replace("/{id}/", `/${row.id}/`);
						config.client_secret = encryptRSA(config.client_secret);
						return auth0ClientConfigModel
							.query()
							.insertAndFetch(config)
							.then(() => row);
					case SingleSignOnClientType.GitHub:
						config.redirect_url = (config.redirect_url || "").replace("/{id}/", `/${row.id}/`);
						config.client_secret = encryptRSA(config.client_secret);
						return githubConfigModel
							.query()
							.insertAndFetch(config)
							.then(() => row);
					case SingleSignOnClientType.OpenID:
						config.redirect_url = (config.redirect_url || "").replace("/{id}/", `/${row.id}/`);
						config.client_secret = encryptRSA(config.client_secret);
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
				const expand = SingleSignOnClient.configByType(row.client_type);
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
				} else if (config.client_secret) {
					config.client_secret = encryptRSA(config.client_secret);
				}
				// update type specific configuration
				switch (row.client_type) {
					case SingleSignOnClientType.Auth0:
						return auth0ClientConfigModel
							.query()
							.where({ sso_client_id: row.id })
							.patch(config)
							.then(() => row);
					case SingleSignOnClientType.GitHub:
						return githubConfigModel
							.query()
							.where({ sso_client_id: row.id })
							.patch(config)
							.then(() => row);
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
				const expand = SingleSignOnClient.configByType(row.client_type);
				return internalSsoClientConfig.get(access, { id: row.id, expand }).then((saved_row) => saved_row);
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
						meta: { ...thisData, configuration: saved_row.configuration },
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
				if (thisRow.configuration_auth0?.client_secret) {
					thisRow.configuration_auth0.client_secret = "";
				}
				if (thisRow.configuration_github?.client_secret) {
					thisRow.configuration_github.client_secret = "";
				}
				if (thisRow.configuration_openid?.client_secret) {
					thisRow.configuration_openid.client_secret = "";
				}
				// Custom omissions
				if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
					return _.omit(thisRow, thisData.omit);
				}

				switch (thisRow.client_type) {
					case SingleSignOnClientType.Auth0:
						thisRow.configuration = thisRow.configuration_auth0;
						break;
					case SingleSignOnClientType.GitHub:
						thisRow.configuration = thisRow.configuration_github;
						break;
					case SingleSignOnClientType.OpenID:
						thisRow.configuration = thisRow.configuration_openid;
						break;
					case SingleSignOnClientType.SAML:
						thisRow.configuration = thisRow.configuration_saml;
						break;
				}

				delete thisRow.configuration_auth0;
				delete thisRow.configuration_github;
				delete thisRow.configuration_openid;
				delete thisRow.configuration_saml;

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
							case SingleSignOnClientType.Auth0:
								return auth0ClientConfigModel
									.query()
									.where({ sso_client_id: row.id })
									.patch({ client_id: "", client_secret: "", domain: "" })
									.then(() => row);
							case SingleSignOnClientType.GitHub:
								return githubConfigModel
									.query()
									.where({ sso_client_id: row.id })
									.patch({ github_client_id: "", client_secret: "" })
									.then(() => row);
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
	 * @returns {Promise}
	 */
	getAll: (access, _expand) => {
		return access.can("settings:list").then(async (/*access_data*/) => {
			const query = ssoClientModel
				.query()
				.select("sso_client.*")
				.leftJoin("sso_auth AS a", "a.sso_client_id", "sso_client.id")
				.select(db().raw("MAX(a.last_login_at) AS accessed"))
				.select(
					db().raw("COUNT(CASE WHEN ?? = ? THEN ?? END) AS ??", [
						"a.auth_type",
						"sso-idp",
						"a.id",
						"provisioned_users",
					]),
					db().raw("COUNT(CASE WHEN ?? = ? THEN ?? END) AS ??", [
						"a.auth_type",
						"sso-npm",
						"a.id",
						"internal_users",
					]),
				)
				.where("sso_client.is_deleted", 0)
				.groupBy("sso_client.id")
				.orderBy("sso_client.name");

			return query.then((result) => {
				return (Array.isArray(result[0]) ? result[0] : result) || [];
			});
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
