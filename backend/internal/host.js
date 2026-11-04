import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import { findForbiddenFileDirective } from "../lib/nginx-advanced.js";
import { global as logger } from "../logger.js";
import deadHostModel from "../models/dead_host.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import internalNginx from "./nginx.js";

const internalHost = {
	/**
	 * Makes sure that the ssl_* and hsts_* fields play nicely together.
	 * ie: if there is no cert, then force_ssl is off.
	 *     if force_ssl is off, then hsts_enabled is definitely off.
	 *
	 * @param   {object} data
	 * @param   {object} [existing_data]
	 * @returns {object}
	 */
	cleanSslHstsData: (data, existingData) => {
		const combinedData = _.assign({}, existingData || {}, data);

		if (!combinedData.certificate_id) {
			combinedData.ssl_forced = false;
			combinedData.http2_support = false;
		}

		if (!combinedData.ssl_forced) {
			combinedData.hsts_enabled = false;
		}

		if (!combinedData.hsts_enabled) {
			combinedData.hsts_subdomains = false;
		}

		return combinedData;
	},

	/**
	 * used by the getAll functions of hosts, this removes the certificate meta if present
	 *
	 * @param   {Array}  rows
	 * @returns {Array}
	 */
	cleanAllRowsCertificateMeta: (rows) => {
		rows.map((_, idx) => {
			if (typeof rows[idx].certificate !== "undefined" && rows[idx].certificate) {
				rows[idx].certificate.meta = {};
			}
			return true;
		});

		return rows;
	},

	/**
	 * used by the get/update functions of hosts, this removes the certificate meta if present
	 *
	 * @param   {Object}  row
	 * @returns {Object}
	 */
	cleanRowCertificateMeta: (row) => {
		if (typeof row.certificate !== "undefined" && row.certificate) {
			row.certificate.meta = {};
		}

		return row;
	},

	/**
	 * Input hygiene for incoming create/update data of all host types:
	 * - strips the server-owned meta keys (the UI sends meta back on save)
	 * - trims upstream host names
	 *
	 * @param   {Object} data
	 * @returns {Object} data, modified in place
	 */
	sanitiseInput: (data) => {
		if (!data || typeof data !== "object") {
			return data;
		}

		internalNginx.stripServerMeta(data);

		for (const field of ["forward_host", "forwarding_host", "forward_domain_name"]) {
			if (typeof data[field] === "string") {
				data[field] = data[field].trim();
			}
		}

		// access_log/error_log into generated configs, include of other hosts' configs: see lib/nginx-advanced.js
		if (typeof data.advanced_config === "string") {
			const forbidden = findForbiddenFileDirective(data.advanced_config);
			if (forbidden) {
				throw new errs.ValidationError(`Advanced configuration: ${forbidden.reason}.`);
			}
		}
		if (Array.isArray(data.locations)) {
			for (const location of data.locations) {
				const forbidden =
					location && typeof location.advanced_config === "string"
						? findForbiddenFileDirective(location.advanced_config)
						: null;
				if (forbidden) {
					throw new errs.ValidationError(
						`Custom location "${location.path || ""}" advanced configuration: ${forbidden.reason}.`,
					);
				}
			}
		}

		return data;
	},

	/**
	 * Puts back the values a failed update patched.
	 *
	 * @param   {Object} model
	 * @param   {Object} before  the row as it was before the update
	 * @param   {Object} patch   the data that was patched
	 * @returns {Promise}
	 */
	restoreRow: async (model, before, patch) => {
		const columns = Object.keys(patch || {}).filter(
			(key) => !["id", "created_on", "modified_on"].includes(key) && Object.hasOwn(before, key),
		);
		const values = _.pick(before, columns);
		// Relations that may have been fetched with the row are not columns
		for (const relation of ["owner", "certificate", "access_list"]) {
			delete values[relation];
		}
		if (Object.keys(values).length) {
			await model.query().where("id", before.id).patch(values);
		}
	},

	/**
	 * The save part of a host update: patches the row, configures nginx and, when nginx rejected the change
	 * and kept the previous config, puts the previous values back. Runs under the nginx lock, so the restore
	 * can't overwrite a concurrent update of the same host.
	 *
	 * The audit entry is written whenever the patch was kept, also when configuring failed for a reason that
	 * does not roll the change back.
	 *
	 * @param   {Object}    opts
	 * @param   {Object}    opts.model
	 * @param   {String}    opts.hostType   proxy_host, redirection_host, dead_host or stream
	 * @param   {Number}    opts.id
	 * @param   {Object}    opts.patch      the data to patch
	 * @param   {Function}  opts.fetch      async () => row, loads the updated row with the relations nginx needs
	 * @param   {Function}  opts.audit      async () => {}, writes the audit entry
	 * @param   {Boolean}   [opts.skipDisabled]  don't configure nginx when the host is disabled
	 * @returns {Promise<Object>} the updated row, with the new meta
	 */
	updateAndConfigure: async ({ model, hostType, id, patch, fetch, audit, skipDisabled = false }) => {
		const writeAudit = async () => {
			try {
				await audit();
			} catch (err) {
				logger.warn(`Could not write the audit log entry for ${hostType} #${id}: ${err.message}`);
			}
		};

		let patched = false;
		try {
			const row = await internalNginx.withLock(async () => {
				const before = await model.query().where("id", id).first();
				await model.query().where("id", id).patch(patch);
				patched = true;
				const updated = await fetch();
				if (skipDisabled && !updated.enabled) {
					return updated;
				}
				try {
					updated.meta = await internalNginx.configure(model, hostType, updated);
				} catch (err) {
					// nginx rejected the change and kept the previous config, so keep the previous data too
					if (before && internalNginx.isHostLevelError(err)) {
						await internalHost.restoreRow(model, before, patch);
						patched = false;
					}
					throw err;
				}
				return updated;
			});
			patched = false;
			await audit();
			return row;
		} catch (err) {
			if (patched) {
				await writeAudit();
			}
			throw err;
		}
	},

	/**
	 * This returns all the host types with any domain listed in the provided domainNames array.
	 * This is used by the certificates to temporarily disable any host that is using the domain
	 *
	 * @param   {Array}  domainNames
	 * @returns {Promise}
	 */
	getHostsWithDomains: async (domainNames) => {
		const responseObject = {
			total_count: 0,
			dead_hosts: [],
			proxy_hosts: [],
			redirection_hosts: [],
		};

		const proxyRes = await proxyHostModel
			.query()
			.where("is_deleted", 0)
			.withGraphFetched("[certificate, access_list.[clients,items]]");
		responseObject.proxy_hosts = internalHost._getHostsWithDomains(proxyRes, domainNames);
		responseObject.total_count += responseObject.proxy_hosts.length;

		const redirRes = await redirectionHostModel.query().where("is_deleted", 0).withGraphFetched("[certificate]");
		responseObject.redirection_hosts = internalHost._getHostsWithDomains(redirRes, domainNames);
		responseObject.total_count += responseObject.redirection_hosts.length;

		const deadRes = await deadHostModel.query().where("is_deleted", 0).withGraphFetched("[certificate]");
		responseObject.dead_hosts = internalHost._getHostsWithDomains(deadRes, domainNames);
		responseObject.total_count += responseObject.dead_hosts.length;

		return responseObject;
	},

	/**
	 * Internal use only, checks to see if the domain is already taken by any other record
	 *
	 * @param   {String}   hostname
	 * @param   {String}   [ignore_type]   'proxy', 'redirection', 'dead'
	 * @param   {Integer}  [ignore_id]     Must be supplied if type was also supplied
	 * @returns {Promise}
	 */
	isHostnameTaken: (hostname, ignore_type, ignore_id) => {
		const promises = [
			proxyHostModel
				.query()
				.where("is_deleted", 0)
				.andWhere(castJsonIfNeed("domain_names"), "like", `%${hostname}%`),
			redirectionHostModel
				.query()
				.where("is_deleted", 0)
				.andWhere(castJsonIfNeed("domain_names"), "like", `%${hostname}%`),
			deadHostModel
				.query()
				.where("is_deleted", 0)
				.andWhere(castJsonIfNeed("domain_names"), "like", `%${hostname}%`),
		];

		return Promise.all(promises).then((promises_results) => {
			let is_taken = false;

			if (promises_results[0]) {
				// Proxy Hosts
				if (
					internalHost._checkHostnameRecordsTaken(
						hostname,
						promises_results[0],
						ignore_type === "proxy" && ignore_id ? ignore_id : 0,
					)
				) {
					is_taken = true;
				}
			}

			if (promises_results[1]) {
				// Redirection Hosts
				if (
					internalHost._checkHostnameRecordsTaken(
						hostname,
						promises_results[1],
						ignore_type === "redirection" && ignore_id ? ignore_id : 0,
					)
				) {
					is_taken = true;
				}
			}

			if (promises_results[2]) {
				// Dead Hosts
				if (
					internalHost._checkHostnameRecordsTaken(
						hostname,
						promises_results[2],
						ignore_type === "dead" && ignore_id ? ignore_id : 0,
					)
				) {
					is_taken = true;
				}
			}

			return {
				hostname: hostname,
				is_taken: is_taken,
			};
		});
	},

	/**
	 * Private call only
	 *
	 * @param   {String}  hostname
	 * @param   {Array}   existingRows
	 * @param   {Integer} [ignoreId]
	 * @returns {Boolean}
	 */
	_checkHostnameRecordsTaken: (hostname, existingRows, ignoreId) => {
		let isTaken = false;

		if (existingRows?.length) {
			existingRows.map((existingRow) => {
				existingRow.domain_names.map((existingHostname) => {
					// Does this domain match?
					if (existingHostname.toLowerCase() === hostname.toLowerCase()) {
						if (!ignoreId || ignoreId !== existingRow.id) {
							isTaken = true;
						}
					}
					return true;
				});
				return true;
			});
		}

		return isTaken;
	},

	/**
	 * Private call only
	 *
	 * @param   {Array}   hosts
	 * @param   {Array}   domainNames
	 * @returns {Array}
	 */
	_getHostsWithDomains: (hosts, domainNames) => {
		const response = [];

		if (hosts?.length) {
			hosts.map((host) => {
				let hostMatches = false;

				domainNames.map((domainName) => {
					host.domain_names.map((hostDomainName) => {
						if (domainName.toLowerCase() === hostDomainName.toLowerCase()) {
							hostMatches = true;
						}
						return true;
					});
					return true;
				});

				if (hostMatches) {
					response.push(host);
				}
				return true;
			});
		}

		return response;
	},
};

export default internalHost;
