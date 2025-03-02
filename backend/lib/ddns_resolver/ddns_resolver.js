const error  = require('../error');
const logger = require('../../logger').ddns;
const utils  = require('../utils');

const ddnsResolver = {
	/** Pattern to match any valid domain/subdomain */
	ddnsRegex: /^((?!-)[A-Za-z\d-]{1,63}(?<!-)\.)+[A-Za-z]{2,6}$/,

	/**
     * Resolves the given address to its IP
     * @param {String} address 
     * @param {boolean} forceUpdate: whether to force resolution instead of using the cached value
     */
	resolveAddress: (address, forceUpdate=false) => {
		if (!forceUpdate && ddnsResolver._cache.has(address)) {
			// Check if it is still valid
			const value       = ddnsResolver._cache.get(address);
			const ip          = value[0];
			const lastUpdated = value[1];
			const nowSeconds  = Date.now();
			const delta       = nowSeconds - lastUpdated;
			if (delta < ddnsResolver._updateIntervalMs) {
				return Promise.resolve(ip);
			}
		}
		ddnsResolver._cache.delete(address);
		// Reach here only if cache value doesn't exist or needs to be updated 
		let host = address.toLowerCase();
		return ddnsResolver._queryHost(host)
			.then((resolvedIP) => {
				ddnsResolver._cache.set(address, [resolvedIP, Date.now()]);
				return resolvedIP;
			})
			.catch((/*error*/) => {
				// return input address in case of failure
				return address;
			});
	},

    
	/** Private **/
	// Properties
	/**
     * cache mapping host to (ip address, last updated time)
     */
	_cache: new Map(),

	// Methods
	/**
     * 
     * @param {String} host 
     * @returns {Promise}
     */
	_queryHost: (host) => {
		return utils.execSafe('getent', ['ahostsv4', 'hosts', host])
			.then((result) => {
				if (result.length < 8) {
					logger.error(`IP lookup for ${host} returned invalid output: ${result}`);
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
