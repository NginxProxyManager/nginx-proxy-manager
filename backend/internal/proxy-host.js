import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import proxyHostModel, { scopeToOwnerOrAllowed } from "../models/proxy_host.js";
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
		let thisData = internalHost.sanitiseInput(data);
		const createCertificate = thisData.certificate_id === "new";
		let createdId = null;
		let issuedCertificateId = null;

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

				internalHost.assertAdvancedConfigAllowed(access, thisData);

				return proxyHostModel.query().insertAndFetch(thisData).then(utils.omitRow(omissions()));
			})
			.then((row) => {
				createdId = row.id;
				if (createCertificate) {
					// Check that nginx accepts the host before a certificate is requested: when the host is
					// rejected the create is rolled back, and a certificate issued for it would be left behind
					// (and renewed forever). The SSL part is checked again when the certificate is added.
					return internalNginx
						.configure(proxyHostModel, "proxy_host", row, { dryRun: true })
						.then(() => internalCertificate.createQuickCertificate(access, thisData))
						.then((cert) => {
							issuedCertificateId = cert.id;
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
				return internalNginx.configure(proxyHostModel, "proxy_host", row).then((newMeta) => {
					row.meta = newMeta;
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
			})
			.catch(async (err) => {
				// nginx rejected the new host: don't keep a host that was never active
				if (createdId && internalNginx.isHostLevelError(err)) {
					await internalHost.discardRejectedCreate(proxyHostModel, "proxy_host", createdId);
				}
				// the certificate requested for it is left unused when the host is gone or was rejected with it
				if (issuedCertificateId) {
					await internalHost.discardUnusedCertificate(issuedCertificateId, () =>
						internalCertificate.delete(access, { id: issuedCertificateId }),
					);
				}
				throw err;
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @return {Promise}
	 */
	update: (access, data) => {
		let thisData = internalHost.sanitiseInput(data);
		const createCertificate = thisData.certificate_id === "new";
		let newCertificateId = null;

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

				// Before anything is configured or a certificate is requested
				internalHost.assertAdvancedConfigAllowed(access, thisData, row);

				if (createCertificate) {
					// Check that nginx accepts the rest of the update before the certificate is requested
					return internalProxyHost
						.get(access, { id: row.id, expand: ["owner", "certificate", "access_list.[clients,items]"] })
						.then((fullRow) =>
							internalHost.checkProposedHost({
								model: proxyHostModel,
								hostType: "proxy_host",
								row: fullRow,
								patch: internalHost.cleanSslHstsData(
									_.assign({}, { domain_names: row.domain_names }, data),
									row,
								),
								skipDisabled: true,
							}),
						)
						.then(() =>
							internalCertificate.createQuickCertificate(access, {
								domain_names: thisData.domain_names || row.domain_names,
								meta: _.assign({}, row.meta, thisData.meta),
							}),
						)
						.then((cert) => {
							// update host with cert id
							thisData.certificate_id = cert.id;
							newCertificateId = cert.id;
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

				return internalHost.updateAndConfigure({
					model: proxyHostModel,
					hostType: "proxy_host",
					id: thisData.id,
					patch: thisData,
					// there's no need to add nginx config if host is disabled
					skipDisabled: true,
					fetch: () =>
						internalProxyHost.get(access, {
							id: thisData.id,
							expand: ["owner", "certificate", "access_list.[clients,items]"],
						}),
					audit: () =>
						internalAuditLog.add(access, {
							action: "updated",
							object_type: "proxy-host",
							object_id: thisData.id,
							meta: thisData,
						}),
				});
			})
			.catch(async (err) => {
				if (newCertificateId) {
					await internalHost.discardUnusedCertificate(newCertificateId, () =>
						internalCertificate.delete(access, { id: newCertificateId }),
					);
				}
				throw err;
			})
			.then((row) => {
				return _.omit(internalHost.cleanRowCertificateMeta(row), omissions());
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
					.allowGraph(proxyHostModel.defaultAllowGraph)
					.first();

				if (access_data.permission_visibility !== "all") {
					scopeToOwnerOrAllowed(query, access.token.getUserId(1), access.getPermissions?.()?.meta);
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
	delete: (access, data) => {
		return access
			.can("proxy_hosts:delete", data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
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
						return internalNginx.removeConfigAndReload("proxy_host", row);
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
	enable: async (access, data) => {
		await access.can("proxy_hosts:update", data.id);
		// 404 and permission check before the lock is taken
		await internalProxyHost.get(access, { id: data.id });
		const row = await internalHost.setEnabledAndConfigure({
			model: proxyHostModel,
			hostType: "proxy_host",
			enable: true,
			fetch: () =>
				internalProxyHost.get(access, {
					id: data.id,
					expand: ["certificate", "owner", "access_list.[clients,items]"],
				}),
			alreadyMessage: "Host is already enabled",
		});

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "enabled",
			object_type: "proxy-host",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});
		return true;
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	disable: async (access, data) => {
		await access.can("proxy_hosts:update", data.id);
		await internalProxyHost.get(access, { id: data.id });
		const row = await internalHost.setEnabledAndConfigure({
			model: proxyHostModel,
			hostType: "proxy_host",
			enable: false,
			fetch: () => internalProxyHost.get(access, { id: data.id }),
			alreadyMessage: "Host is already disabled",
		});

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "disabled",
			object_type: "proxy-host",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});
		return true;
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
			.allowGraph(proxyHostModel.defaultAllowGraph)
			.orderBy(castJsonIfNeed("domain_names"), "ASC");

		if (accessData.permission_visibility !== "all") {
			scopeToOwnerOrAllowed(query, access.token.getUserId(1), access.getPermissions?.()?.meta);
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
	 * @param   {Object}  [permissionsMeta]  the user's permissions meta, as already loaded by access
	 * @returns {Promise}
	 */
	getCount: async (user_id, visibility, permissionsMeta) => {
		const query = proxyHostModel.query().count("id as count").where("is_deleted", 0);

		if (visibility !== "all") {
			scopeToOwnerOrAllowed(query, user_id, permissionsMeta);
		}

		const row = await query.first();
		return Number.parseInt(row.count, 10);
	},
};

export default internalProxyHost;
