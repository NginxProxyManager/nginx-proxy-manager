const internalNginx      = require('../../internal/nginx');
const logger             = require('../../logger').ddns;
const internalAccessList = require('../../internal/access-list');
const ddnsResolver       = require('./ddns_resolver');

const ddnsUpdater = {
	/**
     * Starts a timer to periodically check for ddns updates
     */
	initTimer: () => {
		ddnsUpdater._initialize();
		ddnsUpdater._interval = setInterval(ddnsUpdater._checkForDDNSUpdates, ddnsUpdater._updateIntervalMs);
		logger.info(`DDNS Update Timer initialized (interval: ${Math.floor(ddnsUpdater._updateIntervalMs / 1000)}s)`);
		// Trigger a run so that initial cache is populated and hosts can be updated - delay by 10s to give server time to boot up
		setTimeout(ddnsUpdater._checkForDDNSUpdates, 10 * 1000);
	},

	/** Private **/
	// Properties
	_initialized:          false,
	_updateIntervalMs:     60 * 60 * 1000, // 1 hr default (overriden with $DDNS_UPDATE_INTERVAL env var)
	_interval:             null, // reference to created interval id
	_processingDDNSUpdate: false,

	// Methods

	_initialize: () => {
		if (ddnsUpdater._initialized) {
			return;
		}
		// Init the resolver
		// Read and set custom update interval from env if needed
		if (typeof process.env.DDNS_UPDATE_INTERVAL !== 'undefined') {
			const interval = Number(process.env.DDNS_UPDATE_INTERVAL.toLowerCase());
			if (!isNaN(interval)) {
				// Interval value from env is in seconds. Set min to 60s.
				ddnsUpdater._updateIntervalMs = Math.max(interval * 1000, 60 * 1000);
			} else {
				logger.warn(`[DDNS] invalid value for update interval: '${process.env.DDNS_UPDATE_INTERVAL}'`);
			}
		}
		ddnsUpdater._initialized = true;
	},

	/**
     * Triggered by a timer, will check for and update ddns hosts in access list clients
    */
	_checkForDDNSUpdates: () => {
		logger.info('Checking for DDNS updates...');
		if (!ddnsUpdater._processingDDNSUpdate) {
			ddnsUpdater._processingDDNSUpdate = true;
            
			const updatedAddresses = new Map();

			// Get all ddns hostnames in use
			return ddnsUpdater._getAccessLists()
				.then((rows) => {
					// Build map of used addresses that require resolution
					const usedAddresses = new Map();
					for (const row of rows) {
						if (!row.proxy_host_count) {
							// Ignore rows (access lists) that are not associated to any hosts
							continue;
						}
						for (const client of row.clients) {
							if (!ddnsResolver.requiresResolution(client.address)) {
								continue;
							}
							if (!usedAddresses.has(client.address)) {
								usedAddresses.set(client.address, [row]);
							} else {
								usedAddresses.get(client.address).push(row);
							}
						}
					}
					logger.info(`Found ${usedAddresses.size} address(es) in use.`);
					// Remove unused addresses
					const addressesToRemove = [];
					for (const address of ddnsResolver._cache.keys()) {
						if (!usedAddresses.has(address)) {
							addressesToRemove.push(address);
						}
					}
					addressesToRemove.forEach((address) => { ddnsResolver._cache.delete(address); });

					const promises = [];

					for (const [address, rows] of usedAddresses) {
						let oldIP = '';
						if (ddnsResolver._cache.has(address)) {
							oldIP = ddnsResolver._cache.get(address)[0];
						}
						const p = ddnsResolver.resolveAddress(address, true)
							.then((resolvedIP) => {
								if (resolvedIP !== address && resolvedIP !== oldIP) {
									// Mark this as an updated address
									updatedAddresses.set(address, rows);
								}
							});
						promises.push(p);
					}

					if (promises.length) {
						return Promise.all(promises);
					}
					return Promise.resolve();
				})
				.then(() => {
					logger.info(`${updatedAddresses.size} DDNS IP(s) updated.`);
					const updatedRows = new Map();
					const proxy_hosts = [];
					for (const rows of updatedAddresses.values()) {
						for (const row of rows) {
							if (!updatedRows.has(row.id)) {
								updatedRows.set(row.id, 1);
								for (const host of row.proxy_hosts) {
									if (host.enabled) {
										proxy_hosts.push(host);
									}
								}
							}
						}
					}
					if (proxy_hosts.length) {
						logger.info(`Updating ${proxy_hosts.length} proxy host(s) affected by DDNS changes`);
						return internalNginx.bulkGenerateConfigs('proxy_host', proxy_hosts)
							.then(internalNginx.reload);
					}
					return Promise.resolve();
				})
				.then(() => {
					logger.info('Finished checking for DDNS updates');
					ddnsUpdater._processingDDNSUpdate = false;
				});
		} else {
			logger.info('Skipping since previous DDNS update check is in progress');
		}
	},

	_getAccessLists: () => {
		const fakeAccess = {
			can: (/*role*/) => {
				return Promise.resolve({
					permission_visibility: 'all'
				});
			}
		};
        
		return internalAccessList.getAll(fakeAccess)
			.then((rows) => {
				const promises = [];
				for (const row of rows) {
					const p = internalAccessList.get(fakeAccess, {
						id:     row.id,
						expand: ['owner', 'items', 'clients', 'proxy_hosts.[certificate,access_list.[clients,items]]']
					}, true /* <- skip masking */);
					promises.push(p);
				}
				if (promises.length) {
					return Promise.all(promises);
				}
				return Promise.resolve([]);
			});
	}
};

module.exports = ddnsUpdater;