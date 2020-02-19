const _                    = require('lodash');
const proxyHostModel       = require('../models/proxy_host');
const redirectionHostModel = require('../models/redirection_host');
const deadHostModel        = require('../models/dead_host');

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
	cleanSslHstsData: function (data, existing_data) {
		existing_data = existing_data === undefined ? {} : existing_data;

		let combined_data = _.assign({}, existing_data, data);

		if (!combined_data.certificate_id) {
			combined_data.ssl_forced    = false;
			combined_data.http2_support = false;
		}

		if (!combined_data.ssl_forced) {
			combined_data.hsts_enabled = false;
		}

		if (!combined_data.hsts_enabled) {
			combined_data.hsts_subdomains = false;
		}

		return combined_data;
	},

	/**
	 * used by the getAll functions of hosts, this removes the certificate meta if present
	 *
	 * @param   {Array}  rows
	 * @returns {Array}
	 */
	cleanAllRowsCertificateMeta: function (rows) {
		rows.map(function (row, idx) {
			if (typeof rows[idx].certificate !== 'undefined' && rows[idx].certificate) {
				rows[idx].certificate.meta = {};
			}
		});

		return rows;
	},

	/**
	 * used by the get/update functions of hosts, this removes the certificate meta if present
	 *
	 * @param   {Object}  row
	 * @returns {Object}
	 */
	cleanRowCertificateMeta: function (row) {
		if (typeof row.certificate !== 'undefined' && row.certificate) {
			row.certificate.meta = {};
		}

		return row;
	},

	/**
	 * This returns all the host types with any domain listed in the provided domain_names array.
	 * This is used by the certificates to temporarily disable any host that is using the domain
	 *
	 * @param   {Array}  domain_names
	 * @returns {Promise}
	 */
	getHostsWithDomains: function (domain_names) {
		let promises = [
			proxyHostModel
				.query()
				.where('is_deleted', 0),
			redirectionHostModel
				.query()
				.where('is_deleted', 0),
			deadHostModel
				.query()
				.where('is_deleted', 0)
		];

		return Promise.all(promises)
			.then((promises_results) => {
				let response_object = {
					total_count:       0,
					dead_hosts:        [],
					proxy_hosts:       [],
					redirection_hosts: []
				};

				if (promises_results[0]) {
					// Proxy Hosts
					response_object.proxy_hosts  = internalHost._getHostsWithDomains(promises_results[0], domain_names);
					response_object.total_count += response_object.proxy_hosts.length;
				}

				if (promises_results[1]) {
					// Redirection Hosts
					response_object.redirection_hosts = internalHost._getHostsWithDomains(promises_results[1], domain_names);
					response_object.total_count      += response_object.redirection_hosts.length;
				}

				if (promises_results[1]) {
					// Dead Hosts
					response_object.dead_hosts   = internalHost._getHostsWithDomains(promises_results[2], domain_names);
					response_object.total_count += response_object.dead_hosts.length;
				}

				return response_object;
			});
	},

	/**
	 * Internal use only, checks to see if the domain is already taken by any other record
	 *
	 * @param   {String}   hostname
	 * @param   {String}   [ignore_type]   'proxy', 'redirection', 'dead'
	 * @param   {Integer}  [ignore_id]     Must be supplied if type was also supplied
	 * @returns {Promise}
	 */
	isHostnameTaken: function (hostname, ignore_type, ignore_id) {
		let promises = [
			proxyHostModel
				.query()
				.where('is_deleted', 0)
				.andWhere('domain_names', 'like', '%' + hostname + '%'),
			redirectionHostModel
				.query()
				.where('is_deleted', 0)
				.andWhere('domain_names', 'like', '%' + hostname + '%'),
			deadHostModel
				.query()
				.where('is_deleted', 0)
				.andWhere('domain_names', 'like', '%' + hostname + '%')
		];

		return Promise.all(promises)
			.then((promises_results) => {
				let is_taken = false;

				if (promises_results[0]) {
					// Proxy Hosts
					if (internalHost._checkHostnameRecordsTaken(hostname, promises_results[0], ignore_type === 'proxy' && ignore_id ? ignore_id : 0)) {
						is_taken = true;
					}
				}

				if (promises_results[1]) {
					// Redirection Hosts
					if (internalHost._checkHostnameRecordsTaken(hostname, promises_results[1], ignore_type === 'redirection' && ignore_id ? ignore_id : 0)) {
						is_taken = true;
					}
				}

				if (promises_results[1]) {
					// Dead Hosts
					if (internalHost._checkHostnameRecordsTaken(hostname, promises_results[2], ignore_type === 'dead' && ignore_id ? ignore_id : 0)) {
						is_taken = true;
					}
				}

				return {
					hostname: hostname,
					is_taken: is_taken
				};
			});
	},

	/**
	 * Private call only
	 *
	 * @param   {String}  hostname
	 * @param   {Array}   existing_rows
	 * @param   {Integer} [ignore_id]
	 * @returns {Boolean}
	 */
	_checkHostnameRecordsTaken: function (hostname, existing_rows, ignore_id) {
		let is_taken = false;

		if (existing_rows && existing_rows.length) {
			existing_rows.map(function (existing_row) {
				existing_row.domain_names.map(function (existing_hostname) {
					// Does this domain match?
					if (existing_hostname.toLowerCase() === hostname.toLowerCase()) {
						if (!ignore_id || ignore_id !== existing_row.id) {
							is_taken = true;
						}
					}
				});
			});
		}

		return is_taken;
	},

	/**
	 * Private call only
	 *
	 * @param   {Array}   hosts
	 * @param   {Array}   domain_names
	 * @returns {Array}
	 */
	_getHostsWithDomains: function (hosts, domain_names) {
		let response = [];

		if (hosts && hosts.length) {
			hosts.map(function (host) {
				let host_matches = false;

				domain_names.map(function (domain_name) {
					host.domain_names.map(function (host_domain_name) {
						if (domain_name.toLowerCase() === host_domain_name.toLowerCase()) {
							host_matches = true;
						}
					});
				});

				if (host_matches) {
					response.push(host);
				}
			});
		}

		return response;
	}

};

module.exports = internalHost;
