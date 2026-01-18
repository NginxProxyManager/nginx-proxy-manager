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

const validateRateLimit = (data, existingData) => {
	const combinedData = _.assign({}, existingData || {}, data);
	const rateLimitEnabled = combinedData.rate_limit_enabled === true || combinedData.rate_limit_enabled === 1;

	if (!rateLimitEnabled) {
		return;
	}

	const rateLimit = Number.parseInt(combinedData.rate_limit, 10);
	const rateLimitBurst = Number.parseInt(combinedData.rate_limit_burst ?? 0, 10);
	const rateLimitPeriod = combinedData.rate_limit_period || "minute";

	if (!Number.isFinite(rateLimit) || rateLimit < 1) {
		throw new errs.ValidationError(`Rate limit must be at least 1 request per ${rateLimitPeriod}`);
	}

	if (!Number.isFinite(rateLimitBurst) || rateLimitBurst < 0) {
		throw new errs.ValidationError("Rate limit burst must be 0 or greater");
	}

	if (!["minute", "second"].includes(rateLimitPeriod)) {
		throw new errs.ValidationError("Rate limit period must be either minute or second");
	}
};

const normalizeRateLimit = (data, existingData) => {
	const combinedData = _.assign({}, existingData || {}, data);
	const rateLimitEnabled = combinedData.rate_limit_enabled === true || combinedData.rate_limit_enabled === 1;

	if (!rateLimitEnabled) {
		return data;
	}

	if (typeof data.rate_limit_period === "undefined" && typeof existingData?.rate_limit_period === "undefined") {
		data.rate_limit_period = "minute";
	}

	if (typeof data.rate_limit_delay === "undefined" && typeof existingData?.rate_limit_delay === "undefined") {
		data.rate_limit_delay = false;
	}

	return data;
};

const normalizeLoadBalancing = (data) => {
	if (data.load_balancing_enabled === true || data.load_balancing_enabled === 1) {
		if (typeof data.load_balancing_method === "undefined" || data.load_balancing_method === "") {
			data.load_balancing_method = "round_robin";
		}
		if (!Array.isArray(data.load_balancing_servers)) {
			data.load_balancing_servers = [];
		}
	}

	return data;
};

const validateLoadBalancing = (data, existingData) => {
	const combinedData = _.assign({}, existingData || {}, data);
	const loadBalancingEnabled =
		combinedData.load_balancing_enabled === true || combinedData.load_balancing_enabled === 1;

	if (!loadBalancingEnabled) {
		return;
	}

	const allowedMethods = new Set(["round_robin", "least_conn", "ip_hash"]);
	const loadBalancingMethod = combinedData.load_balancing_method || "round_robin";

	if (!allowedMethods.has(loadBalancingMethod)) {
		throw new errs.ValidationError("Load balancing method must be one of: round_robin, least_conn, ip_hash");
	}

	const servers = combinedData.load_balancing_servers ?? [];
	if (!Array.isArray(servers)) {
		throw new errs.ValidationError("Load balancing servers must be an array");
	}

	if (servers.length === 0) {
		throw new errs.ValidationError("Load balancing requires at least one upstream server");
	}

	servers.forEach((server, index) => {
		if (!server || typeof server !== "object") {
			throw new errs.ValidationError(`Load balancing server #${index + 1} is invalid`);
		}

		const host = typeof server.host === "string" ? server.host.trim() : "";
		const port = Number.parseInt(server.port, 10);
		const weightRaw = server.weight;
		const weight =
			weightRaw === "" || typeof weightRaw === "undefined" || weightRaw === null
				? null
				: Number.parseInt(weightRaw, 10);

		if (!host) {
			throw new errs.ValidationError(`Load balancing server #${index + 1} host is required`);
		}

		if (!Number.isFinite(port) || port < 1 || port > 65535) {
			throw new errs.ValidationError(`Load balancing server #${index + 1} port must be between 1 and 65535`);
		}

		if (weight !== null && (!Number.isFinite(weight) || weight < 1 || weight > 100)) {
			throw new errs.ValidationError(`Load balancing server #${index + 1} weight must be between 1 and 100`);
		}
	});
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

				thisData = normalizeLoadBalancing(thisData);
				thisData = normalizeRateLimit(thisData);
				validateRateLimit(thisData);
				validateLoadBalancing(thisData);

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
				thisData = normalizeLoadBalancing(thisData);
				thisData = normalizeRateLimit(thisData, row);
				validateRateLimit(thisData, row);
				validateLoadBalancing(thisData, row);

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
