import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import proxyHostModel from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";

const omissions = () => {
	return ["is_deleted", "owner.is_deleted"];
};

const internalProxyHost = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		let thisData = data;
		const createCertificate = thisData.certificate_id === "new";

		if (createCertificate) {
			delete thisData.certificate_id;
		}

		return access
			.can("proxy_hosts:create", thisData)
			.then(() => {
				// Get a list of the domain names and check each of them against existing records
				const domain_name_check_promises = [];

				thisData.domain_names.map((domain_name) => {
					domain_name_check_promises.push(internalHost.isHostnameTaken(domain_name));
					return true;
				});

				return Promise.all(domain_name_check_promises).then((check_results) => {
					check_results.map((result) => {
						if (result.is_taken) {
							throw new errs.ValidationError(`${result.hostname} is already in use`);
						}
						return true;
					});
				});
			})
			.then(() => {
				// At this point the domains should have been checked
				thisData.owner_user_id = access.token.getUserId(1);
				thisData = internalHost.cleanSslHstsData(thisData);

				// Fix for db field not having a default value
				// for this optional field.
				if (typeof thisData.advanced_config === "undefined") {
					thisData.advanced_config = "";
				}

				return proxyHostModel.query().insertAndFetch(thisData).then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (createCertificate) {
					return internalCertificate
						.createQuickCertificate(access, thisData)
						.then((cert) => {
							// update host with cert id
							return internalProxyHost.update(access, {
								id: row.id,
								certificate_id: cert.id,
							});
						})
						.then(() => {
							return row;
						});
				}
				return row;
			})
			.then((row) => {
				// re-fetch with cert
				return internalProxyHost.get(access, {
					id: row.id,
					expand: ["certificate", "owner", "access_list.[clients,items]"],
				});
			})
			.then((row) => {
				// Configure nginx
				return internalNginx.configure(proxyHostModel, "proxy_host", row).then(() => {
					return row;
				});
			})
			.then((row) => {
				// Audit log
				thisData.meta = _.assign({}, thisData.meta || {}, row.meta);

				// Add to audit log
				return internalAuditLog
					.add(access, {
						action: "created",
						object_type: "proxy-host",
						object_id: row.id,
						meta: thisData,
					})
					.then(() => {
						return row;
					});
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @return {Promise}
	 */
	update: (access, data) => {
		let thisData = data;
		const create_certificate = thisData.certificate_id === "new";

		if (create_certificate) {
			delete thisData.certificate_id;
		}

		return access
			.can("proxy_hosts:update", thisData.id)
			.then((/*access_data*/) => {
				// Get a list of the domain names and check each of them against existing records
				const domain_name_check_promises = [];

				if (typeof thisData.domain_names !== "undefined") {
					thisData.domain_names.map((domain_name) => {
						return domain_name_check_promises.push(
							internalHost.isHostnameTaken(domain_name, "proxy", thisData.id),
						);
					});

					return Promise.all(domain_name_check_promises).then((check_results) => {
						check_results.map((result) => {
							if (result.is_taken) {
								throw new errs.ValidationError(`${result.hostname} is already in use`);
							}
							return true;
						});
					});
				}
			})
			.then(() => {
				return internalProxyHost.get(access, { id: thisData.id });
			})
			.then((row) => {
				if (row.id !== thisData.id) {
					// Sanity check that something crazy hasn't happened
					throw new errs.InternalValidationError(
						`Proxy Host could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
					);
				}

				if (create_certificate) {
					return internalCertificate
						.createQuickCertificate(access, {
							domain_names: thisData.domain_names || row.domain_names,
							meta: _.assign({}, row.meta, thisData.meta),
						})
						.then((cert) => {
							// update host with cert id
							thisData.certificate_id = cert.id;
						})
						.then(() => {
							return row;
						});
				}
				return row;
			})
			.then((row) => {
				// Add domain_names to the data in case it isn't there, so that the audit log renders correctly. The order is important here.
				thisData = _.assign(
					{},
					{
						domain_names: row.domain_names,
					},
					data,
				);

				thisData = internalHost.cleanSslHstsData(thisData, row);

				return proxyHostModel
					.query()
					.where({ id: thisData.id })
					.patch(thisData)
					.then(utils.omitRow(omissions()))
					.then((saved_row) => {
						// Add to audit log
						return internalAuditLog
							.add(access, {
								action: "updated",
								object_type: "proxy-host",
								object_id: row.id,
								meta: thisData,
							})
							.then(() => {
								return saved_row;
							});
					});
			})
			.then(() => {
				return internalProxyHost
					.get(access, {
						id: thisData.id,
						expand: ["owner", "certificate", "access_list.[clients,items]"],
					})
					.then((row) => {
						if (!row.enabled) {
							// No need to add nginx config if host is disabled
							return row;
						}
						// Configure nginx
						return internalNginx.configure(proxyHostModel, "proxy_host", row).then((new_meta) => {
							row.meta = new_meta;
							return _.omit(internalHost.cleanRowCertificateMeta(row), omissions());
						});
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
			.can("proxy_hosts:get", thisData.id)
			.then((access_data) => {
				const query = proxyHostModel
					.query()
					.where("is_deleted", 0)
					.andWhere("id", thisData.id)
					.allowGraph("[owner,access_list.[clients,items],certificate]")
					.first();

				if (access_data.permission_visibility !== "all") {
					query.andWhere("owner_user_id", access.token.getUserId(1));
				}

				if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
					query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
				}

				return query.then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(thisData.id);
				}
				const thisRow = internalHost.cleanRowCertificateMeta(row);
				// Custom omissions
				if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
					return _.omit(row, thisData.omit);
				}
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
			.can("proxy_hosts:delete", data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(data.id);
				}

				return proxyHostModel
					.query()
					.where("id", row.id)
					.patch({
						is_deleted: 1,
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig("proxy_host", row).then(() => {
							return internalNginx.reload();
						});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "deleted",
							object_type: "proxy-host",
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
			.can("proxy_hosts:update", data.id)
			.then(() => {
				return internalProxyHost.get(access, {
					id: data.id,
					expand: ["certificate", "owner", "access_list"],
				});
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (row.enabled) {
					throw new errs.ValidationError("Host is already enabled");
				}

				row.enabled = 1;

				return proxyHostModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 1,
					})
					.then(() => {
						// Configure nginx
						return internalNginx.configure(proxyHostModel, "proxy_host", row);
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "enabled",
							object_type: "proxy-host",
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
			.can("proxy_hosts:update", data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (!row.enabled) {
					throw new errs.ValidationError("Host is already disabled");
				}

				row.enabled = 0;

				return proxyHostModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 0,
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig("proxy_host", row).then(() => {
							return internalNginx.reload();
						});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "disabled",
							object_type: "proxy-host",
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
	 * All Hosts
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("proxy_hosts:list");
		const query = proxyHostModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph("[owner,access_list,certificate]")
			.orderBy(castJsonIfNeed("domain_names"), "ASC");

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		// Query is used for searching
		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			query.where(function () {
				this.where(castJsonIfNeed("domain_names"), "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		const rows = await query.then(utils.omitRows(omissions()));
		if (typeof expand !== "undefined" && expand !== null && expand.indexOf("certificate") !== -1) {
			return internalHost.cleanAllRowsCertificateMeta(rows);
		}
		return rows;
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: (user_id, visibility) => {
		const query = proxyHostModel.query().count("id as count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}

		return query.first().then((row) => {
			return Number.parseInt(row.count, 10);
		});
	},
};

export default internalProxyHost;
