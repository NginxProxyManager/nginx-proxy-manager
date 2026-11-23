import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import { findForbiddenFileDirective } from "../lib/nginx-advanced.js";
import { findDuplicatePath, matchSavedLocations } from "../lib/nginx-locations.js";
import { global as logger } from "../logger.js";
import deadHostModel from "../models/dead_host.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import streamModel from "../models/stream.js";
import internalNginx from "./nginx.js";

const internalHost = {
	/**
	 * Only admins may set or change advanced_config (raw nginx config). Throws for anyone else.
	 * On create (no `row`), any non-empty advanced_config is refused, including on locations.
	 * On update, the host's advanced_config must be unchanged (or omitted), and locations must
	 * only carry advanced configs the host already has (see assertLocationAdvancedConfigUnchanged).
	 * Then, for everyone, the advanced configs are checked for forbidden file directives (ValidationError).
	 * Call it only after access.can(): it is the first place the advanced config is read.
	 *
	 * @param   {Access}  access
	 * @param   {Object}  data    incoming host data; data.locations may be filled in on update
	 * @param   {Object}  [row]   the existing host, when updating
	 * @throws  {PermissionError|ValidationError}
	 */
	assertAdvancedConfigAllowed: (access, data, row) => {
		if (!access.isAdmin?.()) {
			internalHost.assertAdvancedConfigUnchanged(data, row);
		}
		// Only now, for a caller who may send this config: the check reads every directive of it
		internalHost.assertNoForbiddenFileDirective(data);
	},

	/**
	 * The part of assertAdvancedConfigAllowed() for users who aren't admins.
	 *
	 * @param   {Object}  data
	 * @param   {Object}  [row]
	 * @throws  {PermissionError}
	 */
	assertAdvancedConfigUnchanged: (data, row) => {
		const deny = () => {
			throw new errs.PermissionError("You do not have permission to modify advanced configuration");
		};

		if (!row) {
			const hasConfig = (v) => typeof v === "string" && v.trim() !== "";
			if (hasConfig(data.advanced_config)) {
				deny();
			}
			if (Array.isArray(data.locations) && data.locations.some((loc) => hasConfig(loc?.advanced_config))) {
				deny();
			}
			return;
		}

		if (typeof data.advanced_config !== "undefined" && data.advanced_config !== row.advanced_config) {
			deny();
		}
		if (Array.isArray(data.locations)) {
			internalHost.assertLocationAdvancedConfigUnchanged(data.locations, row.locations);
		}
	},

	/**
	 * For non-admins: every location's advanced_config must be empty or one that already exists
	 * on this host. Matching is by value, not path, so renaming or reordering a location that
	 * carries admin-written config is allowed, but new or edited config is not. Each existing
	 * config can be used once (no duplicating it onto other paths), and same-path matches are
	 * taken first. Clearing a config is allowed: deleting the location is, and has the same
	 * effect, and a location deleted and re-added at the same path arrives with an empty config.
	 * A location that omits advanced_config keeps the one at its path, unless another location
	 * explicitly carries it. Mutates `locations`.
	 *
	 * @param   {Array}  locations          incoming locations
	 * @param   {Array}  [existingLocations] the host's current locations
	 * @throws  {PermissionError}
	 */
	assertLocationAdvancedConfigUnchanged: (locations, existingLocations) => {
		const existing = Array.isArray(existingLocations) ? existingLocations : [];
		// The saved location at the same (trimmed) path; the n-th of a repeated (regex) path is the n-th saved one
		const savedAtPath = matchSavedLocations(locations, existing);
		const advAtPath = (i) => savedAtPath[i]?.advanced_config || "";
		const pool = existing.map((l) => l.advanced_config || "").filter(Boolean);
		const take = (value) => {
			const i = pool.indexOf(value);
			if (i === -1) {
				return false;
			}
			pool.splice(i, 1);
			return true;
		};
		const deny = () => {
			throw new errs.PermissionError("You do not have permission to modify advanced configuration");
		};

		// Pass 1: locations that keep the config at their own path
		const unresolved = [];
		const omitted = [];
		for (const [i, loc] of locations.entries()) {
			const atPath = advAtPath(i);
			if (typeof loc.advanced_config === "undefined") {
				omitted.push(i);
			} else if ((loc.advanced_config || "") === atPath && (!atPath || take(atPath))) {
				// unchanged
			} else {
				unresolved.push(loc);
			}
		}

		// Pass 2: renamed/moved locations may carry an existing config not already claimed, or
		// none at all
		for (const loc of unresolved) {
			if (loc.advanced_config && !take(loc.advanced_config)) {
				deny();
			}
		}

		// Pass 3: locations that omit advanced_config keep the one at their path, if no location
		// that names it explicitly has claimed it. Running this last stops a new location at an
		// old path taking the config away from the location it was renamed to.
		for (const i of omitted) {
			const atPath = advAtPath(i);
			locations[i].advanced_config = atPath && take(atPath) ? atPath : "";
		}
	},

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
	 * - trims upstream host names and location paths
	 * - rejects duplicate custom location paths
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

		if (Array.isArray(data.locations)) {
			data.locations = data.locations.map((location) => {
				if (!location || typeof location !== "object") {
					return location;
				}
				const loc = Object.assign({}, location);
				if (typeof loc.forward_host === "string") {
					loc.forward_host = loc.forward_host.trim();
				}
				if (typeof loc.path === "string") {
					loc.path = loc.path.trim();
				}
				return loc;
			});

			const duplicate = findDuplicatePath(data.locations);
			if (duplicate) {
				throw new errs.ValidationError(`The custom location path "${duplicate}" is used more than once`);
			}
		}

		return data;
	},

	/**
	 * access_log/error_log into generated configs, include of other hosts' configs: see lib/nginx-advanced.js.
	 * Not part of sanitiseInput(), which runs before the permission checks: only users who may send the
	 * advanced config get it read (see assertAdvancedConfigAllowed()).
	 *
	 * @param   {Object} data  incoming host data
	 * @throws  {ValidationError}
	 */
	assertNoForbiddenFileDirective: (data) => {
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
	 * @param   {Object|Function}  opts.patch  the data to patch, or (current) => data: built from the row as it is
	 *                                      under the lock (eg. merged with cleanSslHstsData()), so a row read before
	 *                                      the lock can't put back values a concurrent change wrote in between (eg.
	 *                                      a disable)
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
				const values = typeof patch === "function" ? patch(before || {}) : patch;
				await model.query().where("id", id).patch(values);
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
						await internalHost.restoreRow(model, before, values);
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
	 * For an update that asks for a new certificate (certificate_id "new"): checks that nginx accepts the rest of
	 * the update before the certificate is requested. Otherwise the certificate would be issued, the update
	 * rejected and rolled back, and the certificate left unused but renewed forever. Like create(), the check
	 * runs without a certificate: the current one is about to be replaced and may be the very thing that is
	 * broken (eg. its files are missing). The SSL part is checked when the new certificate is added.
	 *
	 * @param   {Object}   opts
	 * @param   {Object}   opts.model
	 * @param   {String}   opts.hostType       proxy_host, redirection_host, dead_host or stream
	 * @param   {Object}   opts.row            the current row, with the relations nginx needs
	 * @param   {Object}   opts.patch          the data the update will patch (without certificate_id)
	 * @param   {Boolean}  [opts.skipDisabled] the update doesn't configure nginx for a disabled host either
	 * @returns {Promise}  rejects with the error the update would have been rejected with
	 */
	checkProposedHost: async ({ model, hostType, row, patch, skipDisabled = false }) => {
		const proposed = _.assign(
			{},
			row,
			_.omit(patch, ["id", "certificate_id", "certificate", "owner", "access_list", "meta"]),
		);
		// No ssl_certificate, 443 listen, forced SSL or HSTS: the templates test both
		proposed.certificate_id = 0;
		proposed.certificate = null;
		if (skipDisabled && !proposed.enabled) {
			return;
		}
		await internalNginx.configure(model, hostType, proposed, { dryRun: true });
	},

	/**
	 * After a create or update with a new certificate failed: removes that certificate when no host uses it, eg. when
	 * nginx only rejected the update once the certificate was there and the row was rolled back. Never throws,
	 * the update's own error is what the caller reports.
	 *
	 * @param   {Number}    certificateId
	 * @param   {Function}  remove  async (): deletes (and revokes) the certificate
	 * @returns {Promise<boolean>} true when the certificate was removed
	 */
	discardUnusedCertificate: (certificateId, remove) =>
		// Under the nginx lock, like the updates that assign a certificate (see updateAndConfigure()): a host
		// can't take the certificate up between the check and the removal
		internalNginx
			.withLock(async () => {
				for (const model of [proxyHostModel, redirectionHostModel, deadHostModel, streamModel]) {
					const user = await model
						.query()
						.where("is_deleted", 0)
						.andWhere("certificate_id", certificateId)
						.first();
					if (user) {
						return false;
					}
				}
				await remove();
				logger.warn(`Removed certificate #${certificateId}: the update it was requested for was rejected`);
				return true;
			})
			.catch((err) => {
				logger.warn(`Could not remove the unused certificate #${certificateId}: ${err.message}`);
				return false;
			}),

	/**
	 * Rolls back the create of a host that nginx rejected: marks the row deleted and, when a config file of it
	 * is on disk, removes it and reloads nginx. A config can be there although the host was rejected: a new
	 * certificate's request writes the configs of the hosts using its domains (the new host among them,
	 * without the certificate) and nginx loads them, and the rejected configure() then puts that config back
	 * as the host's previous one. Nothing removes the config of a deleted row later, so it would keep
	 * answering for the host's domains. Never throws for the reload.
	 *
	 * @param   {Object}  model
	 * @param   {String}  hostType  proxy_host, redirection_host, dead_host or stream
	 * @param   {Number}  id
	 * @returns {Promise}
	 */
	discardRejectedCreate: (model, hostType, id) =>
		internalNginx.withLock(async () => {
			await model.query().where("id", id).patch({ is_deleted: 1 });
			const filename = internalNginx.getConfigName(hostType, id);
			const served = internalNginx.readConfigFile(filename) !== null;
			await internalNginx.deleteConfig(hostType, { id }, true);
			if (!served) {
				return;
			}
			try {
				const outcome = await internalNginx.reloadNginx();
				if (outcome?.rejected) {
					logger.warn(
						`${hostType} #${id}: nginx did not apply the removal of the rejected new host's config`,
					);
				}
			} catch (err) {
				logger.warn(
					`${hostType} #${id}: could not reload nginx to remove the rejected new host: ${err.message}`,
				);
			}
		}),

	/**
	 * The state change of an enable or disable: re-reads the host, checks that the change is needed, patches
	 * `enabled` and installs or removes the nginx config. All of it runs under the nginx lock, the same lock
	 * updateAndConfigure() holds, so a rejected update can't put back an `enabled` value that a concurrent
	 * enable or disable has written in between, and an enable always configures the latest row.
	 *
	 * When nginx rejects the reload that removes a disabled host's config (for another file), it still serves
	 * the host: the config goes back and the host stays enabled. A host without a config (offline, only its
	 * .err file) is disabled all the same. When nginx rejects an enabled host and keeps
	 * the previous config, the host stays disabled. Any other
	 * failure (eg. only the reload failed) leaves the new config file in place: then it stays enabled,
	 * otherwise the next reload activates a host that the UI shows as disabled.
	 *
	 * @param   {Object}    opts
	 * @param   {Object}    opts.model
	 * @param   {String}    opts.hostType       proxy_host, redirection_host, dead_host or stream
	 * @param   {Boolean}   opts.enable         true to enable, false to disable
	 * @param   {Function}  opts.fetch          async () => row, loads the host with the relations nginx needs
	 * @param   {String}    opts.alreadyMessage  error message when the host already has the requested state
	 * @returns {Promise<Object>} the row as it was configured
	 */
	setEnabledAndConfigure: ({ model, hostType, enable, fetch, alreadyMessage }) =>
		internalNginx.withLock(async () => {
			const row = await fetch();
			if (!!row.enabled === enable) {
				throw new errs.ValidationError(alreadyMessage);
			}
			row.enabled = enable ? 1 : 0;
			await model.query().where("id", row.id).patch({ enabled: row.enabled });

			if (!enable) {
				try {
					await internalNginx.removeConfigAndReload(hostType, row);
				} catch (err) {
					// nginx rejected the reload (for another file: removing a config can't cause it) or the test
					// failed: nginx still serves this host and removeConfigAndReload() put its config back. It stays
					// enabled, as nginx runs it; the disable can be tried again. (An offline host, only
					// <id>.conf.err, isn't served: its disable stands, removeConfigAndReload() doesn't throw then.)
					row.enabled = 1;
					await model.query().where("id", row.id).patch({ enabled: 1 });
					throw err;
				}
				return row;
			}
			try {
				await internalNginx.configure(model, hostType, row);
			} catch (err) {
				if (internalNginx.isHostLevelError(err)) {
					await model.query().where("id", row.id).patch({ enabled: 0 });
				}
				throw err;
			}
			return row;
		}),

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

		// No relations are eager-loaded here: this scans every host just to match domains, and
		// the few that match are rendered through internalNginx.generateConfig(), which loads
		// their certificate and access list itself (loadRenderRelations).
		const proxyRes = await proxyHostModel.query().where("is_deleted", 0);
		responseObject.proxy_hosts = internalHost._getHostsWithDomains(proxyRes, domainNames);
		responseObject.total_count += responseObject.proxy_hosts.length;

		const redirRes = await redirectionHostModel.query().where("is_deleted", 0);
		responseObject.redirection_hosts = internalHost._getHostsWithDomains(redirRes, domainNames);
		responseObject.total_count += responseObject.redirection_hosts.length;

		const deadRes = await deadHostModel.query().where("is_deleted", 0);
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
