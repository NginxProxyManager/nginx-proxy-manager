const error                 = require('../error')
const logger                = require('../../logger').global;
const internalAccessList    = require('../../internal/access-list');
const internalNginx         = require('../../internal/nginx');
const spawn                 = require('child_process').spawn;

const cmdHelper = {
    /**
     * Run the given command. Safer than using exec since args are passed as a list instead of in shell mode as a single string.
     * @param {string} cmd The command to run
     * @param {string} args The args to pass to the command
     * @returns Promise that resolves to stdout or an object with error code and stderr if there's an error
     */
    run: (cmd, args) => {
        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            const proc = spawn(cmd, args);
            proc.stdout.on('data', (data) => {
                stdout += data;
            });
            proc.stderr.on('data', (data) => {
                stderr += data;
            });

            proc.on('close', (exitCode) => {
                if (!exitCode) {
                    resolve(stdout.trim());
                } else {
                    reject({
                        exitCode: exitCode,
                        stderr: stderr
                    });
                }
            });
        });
    }
};

const ddnsResolver = {
    /**
     * Starts a timer to periodically check for ddns updates
     */
    initTimer: () => {
        ddnsResolver._initialize();
        ddnsResolver._interval = setInterval(ddnsResolver._checkForDDNSUpdates, ddnsResolver._updateIntervalMs);
        logger.info(`DDNS Update Timer initialized (interval: ${Math.floor(ddnsResolver._updateIntervalMs / 1000)}s)`);
        // Trigger a run so that initial cache is populated and hosts can be updated - delay by 10s to give server time to boot up
        setTimeout(ddnsResolver._checkForDDNSUpdates, 10 * 1000);
    },

    /**
     * Checks whether the address requires resolution (i.e. starts with ddns:)
     * @param {String} address 
     * @returns {boolean}
     */
    requiresResolution: (address) => {
        if (typeof address !== 'undefined' && address && address.toLowerCase().startsWith('ddns:')) {
			return true;
		}
		return false;
    },

    /**
     * Resolves the given address to its IP
     * @param {String} address 
     * @param {boolean} forceUpdate: whether to force resolution instead of using the cached value
     */
    resolveAddress: (address, forceUpdate=false) => {
        if (!forceUpdate && ddnsResolver._cache.has(address)) {
            // Check if it is still valid
            const value = ddnsResolver._cache.get(address);
            const ip = value[0];
            const lastUpdated = value[1];
            const nowSeconds = Date.now();
            const delta = nowSeconds - lastUpdated;
            if (delta < ddnsResolver._updateIntervalMs) {
                return Promise.resolve(ip);
            }
        }
        ddnsResolver._cache.delete(address);
        // Reach here only if cache value doesn't exist or needs to be updated 
        let host = address.toLowerCase();
        if (host.startsWith('ddns:')) {
            host = host.substring(5);
        }
        return ddnsResolver._queryHost(host)
            .then((resolvedIP) => {
                ddnsResolver._cache.set(address, [resolvedIP, Date.now()]);
                return resolvedIP;
            })
            .catch((_error) => {
                // return input address in case of failure
                return address;
            });
    },

    
    /** Private **/
    // Properties
    _initialized: false,
    _updateIntervalMs: 1000 * 60 * 60, // 1 hr default (overriden with $DDNS_UPDATE_INTERVAL env var)
    /**
     * cache mapping host to (ip address, last updated time)
     */
    _cache: new Map(),
    _interval: null, // reference to created interval id
    _processingDDNSUpdate: false,
    
    _originalGenerateConfig: null, // Used for patching config generation to resolve hosts

    // Methods

    _initialize: () => {
        if (ddnsResolver._initialized) {
            return;
        }
        // Init the resolver
        // Read and set custom update interval from env if needed
        if (typeof process.env.DDNS_UPDATE_INTERVAL !== 'undefined') {
            const interval = Number(process.env.DDNS_UPDATE_INTERVAL.toLowerCase());
            if (!isNaN(interval)) {
                // Interval value from env is in seconds. Set min to 60s.
                ddnsResolver._updateIntervalMs = Math.max(interval * 1000, 60 * 1000);
            } else {
                logger.warn(`[DDNS] invalid value for update interval: '${process.env.DDNS_UPDATE_INTERVAL}'`);
            }
        }
        
        // Patch nginx config generation if needed (check env var)
        if (typeof process.env.DDNS_UPDATE_PATCH !== 'undefined') {
            const enabled = Number(process.env.DDNS_UPDATE_PATCH.toLowerCase());
            if (!isNaN(enabled) && enabled) {
                logger.info('Patching nginx config generation');
                ddnsResolver._originalGenerateConfig = internalNginx.generateConfig;
                internalNginx.generateConfig = ddnsResolver._patchedGenerateConfig;
            }
        }
        ddnsResolver._initialized = true;
    },

    /**
     * 
     * @param {String} host 
     * @returns {Promise}
     */
    _queryHost: (host) => {
        logger.info('Looking up IP for ', host);
        return cmdHelper.run('getent', ['hosts', host])
            .then((result) => {
                if (result.length < 8) {
                    logger.error('IP lookup returned invalid output: ', result);
                    throw error.ValidationError('Invalid output from getent hosts');
                }
                const out = result.split(/\s+/);
                logger.info(`Resolved ${host} to ${out[0]}`);
                return out[0];
            },
            (error) => {
                logger.error('Error looking up IP for ' + host + ': ', error);
                throw error; 
            });
    },

    _patchedGenerateConfig: (host_type, host) => {
        const promises = [];
        if (host_type === 'proxy_host') {
            if (typeof host.access_list !== 'undefined' && typeof host.access_list.clients !== 'undefined') {
                for (const client of host.access_list.clients) {
                    if (ddnsResolver.requiresResolution(client.address)) {
                        const p = ddnsResolver.resolveAddress(client.address)
                            .then((resolvedIP) => {
                                client.address = `${resolvedIP}; # ${client.address}`;
                                return Promise.resolve();
                            });
                        promises.push(p);
                    }
                }
            }
        }
        if (promises.length) {
            return Promise.all(promises)
                .then(() => {
                    return ddnsResolver._originalGenerateConfig(host_type, host);
                });
        }
        return ddnsResolver._originalGenerateConfig(host_type, host);
    },

    /**
     * Triggered by a timer, will check for and update ddns hosts in access list clients
    */
    _checkForDDNSUpdates: () => {
        logger.info('Checking for DDNS updates...');
        if (!ddnsResolver._processingDDNSUpdate) {
            ddnsResolver._processingDDNSUpdate = true;
            
            const updatedAddresses = new Map();

            // Get all ddns hostnames in use
            return ddnsResolver._getAccessLists()
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
                                proxy_hosts.push(...row.proxy_hosts);
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
                    ddnsResolver._processingDDNSUpdate = false;
                });
        } else {
            logger.info('Skipping since previous DDNS update check is in progress');
        }
    },

    _getAccessLists: () => {
        const fakeAccess = {
            can: (capabilityStr) => {
                return Promise.resolve({
                    permission_visibility: 'all'
                })
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

module.exports = ddnsResolver;
