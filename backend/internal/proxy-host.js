import _ from "lodash";
import { UniqueViolationError } from "objection";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import { withProxyHostLock, withUpstreamNameLocks } from "../lib/upstream-name-lock.js";
import { normalizeForwardingMode, normalizeUpstreamName, normalizeUpstreamServers } from "../lib/upstream-servers.js";
import utils from "../lib/utils.js";
import proxyHostModel from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";

const omissions = () => {
	return ["is_deleted", "owner.is_deleted"];
};

const handleUpstreamNameConflict = (error) => {
	// better-sqlite3 errors are not classified by the db-errors version used by
	// Objection. Match its native code and this exact column as well.
	const nativeError = error.nativeError || error;
	if (
		(error instanceof UniqueViolationError &&
			(error.columns?.includes("upstream_name") ||
				error.constraint?.split(".").pop() === "proxy_host_upstream_name_unique")) ||
		(nativeError.code === "SQLITE_CONSTRAINT_UNIQUE" &&
			/UNIQUE constraint failed: proxy_host\.upstream_name$/.test(nativeError.message))
	) {
		throw new errs.ValidationError("Upstream name is already in use");
	}
	throw error;
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
				thisData.upstream_name = normalizeUpstreamName(thisData.upstream_name);
				if (thisData.upstream_servers) {
					thisData.upstream_servers = normalizeUpstreamServers(thisData.upstream_servers, thisData.lb_method);
				}
				const mode = normalizeForwardingMode(thisData.forwarding_mode, thisData.upstream_servers ?? []);
				thisData.forwarding_mode = thisData.forwarding_mode === null ? null : mode;
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

				return withUpstreamNameLocks([thisData.upstream_name], () =>
					proxyHostModel.query().insertAndFetch(thisData).catch(handleUpstreamNameConflict),
				).then(utils.omitRow(omissions()));
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
			.then((row) => configureCreatedHost(access, row))
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
	update: withProxyHostLock((access, data) => {
		let thisData = data;
		const createCertificate = thisData.certificate_id === "new";

		if (createCertificate) {
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

				if (thisData.upstream_name !== undefined) {
					thisData.upstream_name = normalizeUpstreamName(thisData.upstream_name);
				}

				const servers = normalizeUpstreamServers(
					thisData.upstream_servers ?? row.upstream_servers ?? [],
					thisData.lb_method ?? row.lb_method,
				);
				if (thisData.upstream_servers !== undefined) {
					thisData.upstream_servers = servers;
				}
				const mode = normalizeForwardingMode(
					thisData.forwarding_mode !== undefined ? thisData.forwarding_mode : row.forwarding_mode,
					servers,
				);
				if (thisData.forwarding_mode !== undefined) {
					thisData.forwarding_mode = thisData.forwarding_mode === null ? null : mode;
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
				const names =
					thisData.upstream_name !== undefined && thisData.upstream_name !== row.upstream_name
						? [row.upstream_name, thisData.upstream_name]
						: [];

				return withUpstreamNameLocks(names, () => {
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
						.catch(handleUpstreamNameConflict)
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
						})
						.then(() => {
							return internalProxyHost
								.get(access, {
									id: thisData.id,
									expand: ["owner", "certificate", "access_list.[clients,items]"],
								})
								.then((updatedRow) => {
									if (!updatedRow.enabled) {
										// No need to add nginx config if host is disabled
										return updatedRow;
									}
									// Configure nginx
									return internalNginx
										.configure(proxyHostModel, "proxy_host", updatedRow)
										.then((new_meta) => {
											updatedRow.meta = new_meta;
											return _.omit(
												internalHost.cleanRowCertificateMeta(updatedRow),
												omissions(),
											);
										});
								});
						});
				});
			});
	}),

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
					.allowGraph(proxyHostModel.defaultAllowGraph)
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
				if (!row?.id) {
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
	delete: withProxyHostLock((access, data) => {
		return access
			.can("proxy_hosts:delete", data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}

				return withUpstreamNameLocks([row.upstream_name], () =>
					proxyHostModel
						.query()
						.where("id", row.id)
						.patch({
							is_deleted: 1,
							upstream_name: null,
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
						}),
				);
			})
			.then(() => {
				return true;
			});
	}),

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	enable: withProxyHostLock((access, data) => {
		return access
			.can("proxy_hosts:update", data.id)
			.then(() => {
				return internalProxyHost.get(access, {
					id: data.id,
					expand: ["certificate", "owner", "access_list"],
				});
			})
			.then(async (row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (row.enabled) {
					throw new errs.ValidationError("Host is already enabled");
				}

				row.enabled = 1;

				await proxyHostModel.query().where("id", row.id).patch({
					enabled: 1,
				});

				// Configure nginx
				await internalNginx.configure(proxyHostModel, "proxy_host", row);

				// Add to audit log
				await internalAuditLog.add(access, {
					action: "enabled",
					object_type: "proxy-host",
					object_id: row.id,
					meta: _.omit(row, omissions()),
				});

				return true;
			});
	}),

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	disable: withProxyHostLock((access, data) => {
		return access
			.can("proxy_hosts:update", data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
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
	}),

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
			.allowGraph(proxyHostModel.defaultAllowGraph)
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

// Read and configure under the same host lock: a concurrent delete/rename must
// not leave a config generated from a stale row after its name has been released.
const configureCreatedHost = withProxyHostLock(async (access, data) => {
	const row = await internalProxyHost.get(access, {
		id: data.id,
		expand: ["certificate", "owner", "access_list.[clients,items]"],
	});
	if (row.enabled) {
		await internalNginx.configure(proxyHostModel, "proxy_host", row);
	}
	return row;
});

export default internalProxyHost;
