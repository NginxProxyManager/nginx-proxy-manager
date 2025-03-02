const error  = require('../error');
const logger = require('../../logger').ddns;
const utils  = require('../utils');

const ddnsResolver = {
	/** Pattern to match any valid domain/subdomain */
	ddnsRegex: /^((?!-)[A-Za-z\d-]{1,63}(?<!-)\.)+[A-Za-z]{2,6}$/,

	/**
     * Resolves the given address to its IP
     * @param {String} domainName domain name of the dynamic DNS record
     * @param {boolean} forceUpdate option to force resolution instead of using the cached value
     */
	resolveAddress: (domainName, forceUpdate=false) => {
		if (!forceUpdate && ddnsResolver._cache.has(domainName)) {
			// Check if it is still valid
			const value       = ddnsResolver._cache.get(domainName);
			const ip          = value[0];
			const lastUpdated = value[1];
			const nowSeconds  = Date.now();
			const delta       = nowSeconds - lastUpdated;
			if (delta < ddnsResolver._updateIntervalMs) {
				return Promise.resolve(ip);
			}
		}
		ddnsResolver._cache.delete(domainName);
		// Reach here only if cache value doesn't exist or needs to be updated 
		let host = domainName.toLowerCase();
		return ddnsResolver._queryHost(host)
			.then((resolvedIP) => {
				ddnsResolver._cache.set(domainName, [resolvedIP, Date.now()]);
				return resolvedIP;
			})
			.catch((/*error*/) => {
				// return input address in case of failure
				logger.error(`Failed to resolve IP for ${host}`);
				return domainName;
			});
	},

    
	/** Cache mapping host to (ip address, last updated time) */
	_cache: new Map(),

	/**
     * Uses execSafe to query the IP address of the given host
     * @param {String} host host to query
     * @returns {Promise} resolves to the IPV4 address of the host
     */
	_queryHost: (host) => {
		return utils.execSafe('getent', ['ahostsv4', host])
			.then((result) => {
				if (result.length < 8 || !/^(\d{1,3}\.){3}\d{1,3}$/.test(result)) {
					logger.error(`IPV4 lookup for ${host} returned invalid output: ${result}`);
					throw error.ValidationError('Invalid output from getent hosts');
				}
				const out = result.split(/\s+/);
				return out[0];
			},
			(error) => {
				logger.error('Error looking up IP for ' + host + ': ', error);
				throw error; 
			});
	},
};

module.exports = ddnsResolver;
