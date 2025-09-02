import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import deadHostModel from "../models/dead_host.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";

const omissions = () => {
	return ["is_deleted"];
};

const internalDeadHost = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		const createCertificate = data.certificate_id === "new";

		if (createCertificate) {
			delete data.certificate_id;
		}

		return access
			.can("dead_hosts:create", data)
			.then((/*access_data*/) => {
				// Get a list of the domain names and check each of them against existing records
				const domain_name_check_promises = [];

				data.domain_names.map((domain_name) => {
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
				data.owner_user_id = access.token.getUserId(1);
				const thisData = internalHost.cleanSslHstsData(data);

				// Fix for db field not having a default value
				// for this optional field.
				if (typeof data.advanced_config === "undefined") {
					thisData.advanced_config = "";
				}

				return deadHostModel.query().insertAndFetch(thisData).then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (createCertificate) {
					return internalCertificate
						.createQuickCertificate(access, data)
						.then((cert) => {
							// update host with cert id
							return internalDeadHost.update(access, {
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
				return internalDeadHost.get(access, {
					id: row.id,
					expand: ["certificate", "owner"],
				});
			})
			.then((row) => {
				// Configure nginx
				return internalNginx.configure(deadHostModel, "dead_host", row).then(() => {
					return row;
				});
			})
			.then((row) => {
				data.meta = _.assign({}, data.meta || {}, row.meta);

				// Add to audit log
				return internalAuditLog
					.add(access, {
						action: "created",
						object_type: "dead-host",
						object_id: row.id,
						meta: data,
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
		const createCertificate = thisData.certificate_id === "new";

		if (createCertificate) {
			delete thisData.certificate_id;
		}

		return access
			.can("dead_hosts:update", thisData.id)
			.then((/*access_data*/) => {
				// Get a list of the domain names and check each of them against existing records
				const domain_name_check_promises = [];

				if (typeof thisData.domain_names !== "undefined") {
					thisData.domain_names.map((domain_name) => {
						domain_name_check_promises.push(internalHost.isHostnameTaken(domain_name, "dead", data.id));
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
				}
			})
			.then(() => {
				return internalDeadHost.get(access, { id: thisData.id });
			})
			.then((row) => {
				if (row.id !== thisData.id) {
					// Sanity check that something crazy hasn't happened
					throw new errs.InternalValidationError(
						`404 Host could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
					);
				}

				if (createCertificate) {
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

				return deadHostModel
					.query()
					.where({ id: thisData.id })
					.patch(thisData)
					.then((saved_row) => {
						// Add to audit log
						return internalAuditLog
							.add(access, {
								action: "updated",
								object_type: "dead-host",
								object_id: row.id,
								meta: thisData,
							})
							.then(() => {
								return _.omit(saved_row, omissions());
							});
					});
			})
			.then(() => {
				return internalDeadHost
					.get(access, {
						id: thisData.id,
						expand: ["owner", "certificate"],
					})
					.then((row) => {
						// Configure nginx
						return internalNginx.configure(deadHostModel, "dead_host", row).then((new_meta) => {
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
			.can("dead_hosts:get", thisData.id)
			.then((access_data) => {
				const query = deadHostModel
					.query()
					.where("is_deleted", 0)
					.andWhere("id", dthisDataata.id)
					.allowGraph("[owner,certificate]")
					.first();

				if (access_data.permission_visibility !== "all") {
					query.andWhere("owner_user_id", access.token.getUserId(1));
				}

				if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
					query.withGraphFetched(`[${data.expand.join(", ")}]`);
				}

				return query.then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(thisData.id);
				}
				// Custom omissions
				if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
					return _.omit(row, thisData.omit);
				}
				return row;
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
			.can("dead_hosts:delete", data.id)
			.then(() => {
				return internalDeadHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(data.id);
				}

				return deadHostModel
					.query()
					.where("id", row.id)
					.patch({
						is_deleted: 1,
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig("dead_host", row).then(() => {
							return internalNginx.reload();
						});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "deleted",
							object_type: "dead-host",
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
			.can("dead_hosts:update", data.id)
			.then(() => {
				return internalDeadHost.get(access, {
					id: data.id,
					expand: ["certificate", "owner"],
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

				return deadHostModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 1,
					})
					.then(() => {
						// Configure nginx
						return internalNginx.configure(deadHostModel, "dead_host", row);
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "enabled",
							object_type: "dead-host",
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
			.can("dead_hosts:update", data.id)
			.then(() => {
				return internalDeadHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (!row.enabled) {
					throw new errs.ValidationError("Host is already disabled");
				}

				row.enabled = 0;

				return deadHostModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 0,
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig("dead_host", row).then(() => {
							return internalNginx.reload();
						});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "disabled",
							object_type: "dead-host",
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
	getAll: (access, expand, search_query) => {
		return access
			.can("dead_hosts:list")
			.then((access_data) => {
				const query = deadHostModel
					.query()
					.where("is_deleted", 0)
					.groupBy("id")
					.allowGraph("[owner,certificate]")
					.orderBy(castJsonIfNeed("domain_names"), "ASC");

				if (access_data.permission_visibility !== "all") {
					query.andWhere("owner_user_id", access.token.getUserId(1));
				}

				// Query is used for searching
				if (typeof search_query === "string" && search_query.length > 0) {
					query.where(function () {
						this.where(castJsonIfNeed("domain_names"), "like", `%${search_query}%`);
					});
				}

				if (typeof expand !== "undefined" && expand !== null) {
					query.withGraphFetched(`[${expand.join(", ")}]`);
				}

				return query.then(utils.omitRows(omissions()));
			})
			.then((rows) => {
				if (typeof expand !== "undefined" && expand !== null && expand.indexOf("certificate") !== -1) {
					return internalHost.cleanAllRowsCertificateMeta(rows);
				}

				return rows;
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
		const query = deadHostModel.query().count("id as count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}

		return query.first().then((row) => {
			return Number.parseInt(row.count, 10);
		});
	},
};

export default internalDeadHost;
