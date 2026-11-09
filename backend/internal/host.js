import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import deadHostModel from "../models/dead_host.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";

const internalHost = {
	/**
	 * Only admins may set or change advanced_config (raw nginx config). Throws for anyone else.
	 * On create (no `row`), any non-empty advanced_config is refused, including on locations.
	 * On update, the host's advanced_config must be unchanged (or omitted), and locations must
	 * only carry advanced configs the host already has (see assertLocationAdvancedConfigUnchanged).
	 *
	 * @param   {Access}  access
	 * @param   {Object}  data    incoming host data; data.locations may be filled in on update
	 * @param   {Object}  [row]   the existing host, when updating
	 * @throws  {PermissionError}
	 */
	assertAdvancedConfigAllowed: (access, data, row) => {
		if (access.isAdmin?.()) {
			return;
		}
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
	 * For non-admins: every location's advanced_config must be one that already exists on this
	 * host. Matching is by value, not path, so renaming or reordering a location that carries
	 * admin-written config is allowed, but new or edited config is not. Each existing config can
	 * be used once (no duplicating it onto other paths), and same-path matches are taken first.
	 * A location that omits advanced_config keeps the one at its path, unless another location
	 * explicitly carries it. Mutates `locations`.
	 *
	 * @param   {Array}  locations          incoming locations
	 * @param   {Array}  [existingLocations] the host's current locations
	 * @throws  {PermissionError}
	 */
	assertLocationAdvancedConfigUnchanged: (locations, existingLocations) => {
		const existing = Array.isArray(existingLocations) ? existingLocations : [];
		const advAtPath = (path) => existing.find((l) => l.path === path)?.advanced_config || "";
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
		for (const loc of locations) {
			const atPath = advAtPath(loc.path);
			if (typeof loc.advanced_config === "undefined") {
				omitted.push(loc);
			} else if ((loc.advanced_config || "") === atPath && (!atPath || take(atPath))) {
				// unchanged
			} else {
				unresolved.push(loc);
			}
		}

		// Pass 2: renamed/moved locations may carry an existing config not already claimed.
		// Clearing a config is not allowed, as before.
		for (const loc of unresolved) {
			if (!loc.advanced_config || !take(loc.advanced_config)) {
				deny();
			}
		}

		// Pass 3: locations that omit advanced_config keep the one at their path, if no location
		// that names it explicitly has claimed it. Running this last stops a new location at an
		// old path taking the config away from the location it was renamed to.
		for (const loc of omitted) {
			const atPath = advAtPath(loc.path);
			loc.advanced_config = atPath && take(atPath) ? atPath : "";
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
