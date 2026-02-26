/**
 * Low-level ldapjs wrapper for LDAP/LDAPS/STARTTLS connections.
 *
 * Supports:
 *  - ldap://  (port 389)
 *  - ldaps:// (port 636, TLS from the start)
 *  - STARTTLS upgrade over ldap://
 *
 * Dead-socket prevention:
 *  - TCP keep-alive is enabled on every socket so OS-level probes detect
 *    silently-dropped connections (firewall RST, server restart, etc.).
 *  - An idle reaper runs every REAPER_INTERVAL_MS and destroys pool entries
 *    that have not been used for longer than DEFAULT_IDLE_TIMEOUT_MS.
 *  - borrowFromPool performs a lightweight socket-health check before handing
 *    a pooled client to the caller; stale clients are discarded and a fresh
 *    connection is made transparently.
 *
 * Usage:
 *   const client = await LdapClient.create(config);
 *   await client.bind(dn, password);
 *   const entries = await client.search(base, options);
 *   client.destroy();
 */

import ldap from "ldapjs";
import { global as logger } from "../logger.js";

// How long (ms) to wait for a connection before giving up
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

// How long (ms) to wait for individual LDAP operations
const DEFAULT_OP_TIMEOUT_MS = 15_000;

// TCP keep-alive probe interval (ms).  After this idle period the OS starts
// sending TCP ACK probes so a dead peer is detected at the network level.
const DEFAULT_KEEP_ALIVE_MS = 30_000;

// How long (ms) a pooled connection may sit idle before the reaper destroys it.
// Default: 5 minutes — well within most firewall idle-flow timeouts.
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1_000;

// How often the idle reaper wakes up to inspect the pool.
const REAPER_INTERVAL_MS = 60_000;

// Hard cap on simultaneously active (borrowed) LDAP connections per pool key.
// Prevents socket exhaustion under concurrent load (DoS protection).
const DEFAULT_MAX_CONNECTIONS = 10;

// How long (ms) a queued borrow request waits before timing out.
const DEFAULT_ACQUIRE_TIMEOUT_MS = 5_000;

/**
 * Map ldapjs error codes / names to human-readable messages.
 *
 * @param  {Error}  err
 * @returns {string}
 */
const mapLdapError = (err) => {
	if (!err) {
		return "Unknown LDAP error";
	}

	// ldapjs puts a numeric .code on errors
	const code = err.code ?? err.lde_errno;
	switch (code) {
		case 49:
			return "Invalid credentials — check bind DN and password";
		case 32:
			return "No such object — the search base or user DN does not exist";
		case 34:
			return "Invalid DN syntax";
		case 53:
			return "Server refused the operation (unwilling to perform)";
		case 1:
			return "LDAP operations error";
		case 7:
			return "Auth method not supported";
		case 8:
			return "Strong auth required (server requires LDAPS or STARTTLS)";
		case 51:
			return "LDAP server is busy — try again later";
		case 52:
			return "LDAP server is unavailable";
		default:
			return err.message || `LDAP error (code ${code})`;
	}
};

/**
 * Enable TCP keep-alive on the socket underlying an ldapjs client.
 *
 * ldapjs exposes the raw net.Socket (or tls.TLSSocket) via `client.socket`.
 * We call setKeepAlive() immediately and also hook 'connect' in case the
 * socket is not yet established when this is called.
 *
 * @param  {ldap.Client} rawClient
 * @param  {number}      [intervalMs]
 */
const enableKeepAlive = (rawClient, intervalMs = DEFAULT_KEEP_ALIVE_MS) => {
	const applyKeepAlive = (socket) => {
		if (socket && typeof socket.setKeepAlive === "function") {
			socket.setKeepAlive(true, intervalMs);
			logger.debug(`[ldap-client] TCP keep-alive enabled (interval=${intervalMs}ms)`);
		}
	};

	// Apply immediately if the socket is already available
	if (rawClient.socket) {
		applyKeepAlive(rawClient.socket);
	}

	// Also hook the 'connect' event in case the socket is assigned later
	// (ldapjs may replace .socket after STARTTLS upgrade)
	rawClient.on("connect", () => {
		applyKeepAlive(rawClient.socket);
	});
};

/**
 * Build a raw ldapjs client with timeout and TLS configuration.
 *
 * @param  {Object}  cfg
 * @param  {string}  cfg.serverUrl       e.g. "ldap://dc.example.com" or "ldaps://..."
 * @param  {boolean} [cfg.tlsVerify]     Whether to verify the TLS certificate (default: true)
 * @param  {number}  [cfg.connectTimeout] Connection timeout in ms
 * @returns {Promise<ldap.Client>}
 */
const createRawClient = (cfg) => {
	return new Promise((resolve, reject) => {
		const connectTimeout = cfg.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT_MS;

		const tlsOptions = {
			rejectUnauthorized: cfg.tlsVerify !== false,
		};

		const client = ldap.createClient({
			url:            cfg.serverUrl,
			connectTimeout: connectTimeout,
			timeout:        cfg.opTimeout ?? DEFAULT_OP_TIMEOUT_MS,
			tlsOptions,
			// Disable automatic referral chasing by default; we handle it explicitly
			referrals:      cfg.followReferrals === true,
		});

		// Capture the first connect error before the caller gets the client
		const onError = (err) => {
			reject(new Error(`LDAP connection failed: ${mapLdapError(err)}`));
		};

		client.once("error", onError);
		client.once("connect", () => {
			client.removeListener("error", onError);
			resolve(client);
		});

		// ldapjs emits "connect" lazily; set a hard timer in case neither fires
		const timer = setTimeout(() => {
			client.destroy();
			reject(new Error(`LDAP connection timed out after ${connectTimeout}ms`));
		}, connectTimeout + 1000);

		// Clear the timer once we get either outcome
		client.once("connect", () => clearTimeout(timer));
		client.once("error",   () => clearTimeout(timer));
	});
};

/**
 * Wrap the ldapjs client's bind() in a Promise.
 *
 * @param  {ldap.Client} client
 * @param  {string}      dn
 * @param  {string}      password
 * @returns {Promise<void>}
 */
const bindClient = (client, dn, password) => {
	return new Promise((resolve, reject) => {
		client.bind(dn, password, (err) => {
			if (err) {
				reject(new Error(mapLdapError(err)));
			} else {
				resolve();
			}
		});
	});
};

/**
 * Wrap the ldapjs client's search() in a Promise that collects all entries.
 *
 * @param  {ldap.Client} client
 * @param  {string}      base
 * @param  {Object}      options  — ldapjs SearchOptions
 * @returns {Promise<Object[]>}   — array of plain attribute objects
 */
const searchClient = (client, base, options) => {
	return new Promise((resolve, reject) => {
		const entries = [];

		client.search(base, options, (err, res) => {
			if (err) {
				reject(new Error(mapLdapError(err)));
				return;
			}

			res.on("searchEntry", (entry) => {
				// Convert ldapjs Attribute objects to plain key→value pairs
				const obj = { dn: entry.dn.toString() };
				for (const attr of entry.attributes) {
					const name = attr.type;
					const vals = attr.values;
					obj[name] = vals.length === 1 ? vals[0] : vals;
				}
				entries.push(obj);
			});

			res.on("searchReference", (referral) => {
				logger.debug(`[ldap-client] Skipping referral: ${referral.uris.join(", ")}`);
			});

			res.on("error", (err) => {
				reject(new Error(mapLdapError(err)));
			});

			res.on("end", (result) => {
				if (result.status !== 0) {
					reject(new Error(`LDAP search ended with status ${result.status}`));
				} else {
					resolve(entries);
				}
			});
		});
	});
};

// ---------------------------------------------------------------------------
// Connection pool
// ---------------------------------------------------------------------------

/**
 * A simple pool that keeps up to `maxSize` authenticated (service-account-bound)
 * clients alive and recycles them on re-use.  If a pooled client throws a
 * connection-level error it is discarded and a fresh one is created.
 *
 * Pool keys are derived from the config so different server/credentials combos
 * get independent pools.
 *
 * Dead-socket prevention:
 *  - Each pool entry carries a `_lastUsed` timestamp.
 *  - An idle reaper (setInterval) purges entries idle longer than idleTimeoutMs.
 *  - borrowFromPool validates the socket is still writable before returning it.
 */
const pools = new Map();

/** Map of poolKey → setInterval handle for the idle reaper. */
const reaperHandles = new Map();

/**
 * Per-pool semaphore state.
 *
 * Shape: { activeCount: number, waiters: Array<{resolve, reject, timer}>,
 *          maxConnections: number, acquireTimeout: number }
 *
 * `activeCount` is the number of connections currently borrowed by callers.
 * `maxConnections` is the hard cap; when reached, new borrow requests queue.
 * `acquireTimeout` is the ms deadline for queued borrow requests.
 */
const semaphores = new Map();

const poolKey = (cfg) =>
	`${cfg.serverUrl}|${cfg.bindDN ?? ""}|${cfg.starttls ? "starttls" : "plain"}`;

/**
 * Return (creating if needed) the semaphore entry for a pool key.
 *
 * @param  {string} key
 * @param  {Object} cfg
 * @returns {{ activeCount, waiters, maxConnections, acquireTimeout }}
 */
const getSemaphore = (key, cfg) => {
	if (!semaphores.has(key)) {
		semaphores.set(key, {
			activeCount:    0,
			waiters:        [],
			maxConnections: cfg.maxConnections ?? DEFAULT_MAX_CONNECTIONS,
			acquireTimeout: cfg.acquireTimeout ?? DEFAULT_ACQUIRE_TIMEOUT_MS,
		});
	}
	return semaphores.get(key);
};

/**
 * Start (or restart) the idle-connection reaper for a given pool key.
 *
 * The reaper fires every REAPER_INTERVAL_MS and destroys any pooled client
 * whose `_lastUsed` timestamp is older than `idleTimeoutMs`.
 *
 * @param {string} key
 * @param {number} [idleTimeoutMs]
 */
const startReaper = (key, idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS) => {
	if (reaperHandles.has(key)) {
		return; // already running
	}

	const handle = setInterval(() => {
		const pool = pools.get(key);
		if (!pool || pool.length === 0) {
			return;
		}

		const now = Date.now();
		const survivors = [];

		for (const client of pool) {
			const idleMs = now - (client._lastUsed ?? 0);
			if (client._destroyed || idleMs > idleTimeoutMs) {
				logger.debug(
					`[ldap-client] Reaping idle connection (idle=${idleMs}ms, destroyed=${client._destroyed})`,
				);
				client.destroy();
			} else {
				survivors.push(client);
			}
		}

		pools.set(key, survivors);
	}, REAPER_INTERVAL_MS);

	// Allow the process to exit even if the reaper is still running
	if (handle.unref) {
		handle.unref();
	}

	reaperHandles.set(key, handle);
};

/**
 * Stop the idle-connection reaper for a given pool key.
 * Exposed primarily for testing.
 *
 * @param {string} key
 */
const stopReaper = (key) => {
	const handle = reaperHandles.get(key);
	if (handle) {
		clearInterval(handle);
		reaperHandles.delete(key);
	}
};

/**
 * Perform a lightweight socket-level health check on an LdapClient.
 *
 * Returns true if the underlying socket appears writable and not destroyed.
 * This catches connections that were silently dropped by a firewall or remote
 * server without us receiving an RST/FIN (the `_destroyed` flag stays false).
 *
 * @param  {LdapClient} client
 * @returns {boolean}
 */
const isSocketHealthy = (client) => {
	if (client._destroyed) {
		return false;
	}

	const socket = client._client?.socket;
	if (!socket) {
		// No socket reference — can't verify; treat as unhealthy to be safe
		return false;
	}

	// net.Socket / tls.TLSSocket expose .destroyed and .writable
	if (socket.destroyed) {
		return false;
	}

	if (socket.writable === false) {
		return false;
	}

	return true;
};

/**
 * Borrow a connected + bound client from the pool (or create a fresh one).
 *
 * Before returning a pooled client the socket is health-checked; stale
 * connections are discarded and a fresh client is created transparently.
 *
 * A global semaphore (per pool key) enforces `cfg.maxConnections` (default 10).
 * When the semaphore is exhausted, the call queues and waits up to
 * `cfg.acquireTimeout` ms (default 5 000 ms) before rejecting.  This prevents
 * socket exhaustion under concurrent load.
 *
 * @param  {Object} cfg               — full LDAP config (see LdapClient.create)
 * @param  {number} [cfg.maxConnections=10]   Hard cap on simultaneous connections
 * @param  {number} [cfg.acquireTimeout=5000] ms to wait when pool is exhausted
 * @returns {Promise<LdapClient>}
 */
const borrowFromPool = async (cfg) => {
	const key  = poolKey(cfg);
	const sem  = getSemaphore(key, cfg);

	if (!pools.has(key)) {
		pools.set(key, []);
	}
	const pool = pools.get(key);

	// ── Try idle pool first ─────────────────────────────────────────────────
	while (pool.length > 0) {
		const candidate = pool.pop();

		if (!isSocketHealthy(candidate)) {
			logger.debug("[ldap-client] Discarding unhealthy pooled connection");
			candidate.destroy();
			// Discarding an idle connection frees a slot; don't change activeCount
			continue;
		}

		// Move connection from idle → active
		sem.activeCount++;
		candidate._lastUsed = Date.now();
		return candidate;
	}

	// ── Semaphore: create new connection if under the cap ───────────────────
	if (sem.activeCount < sem.maxConnections) {
		sem.activeCount++;
		try {
			return await LdapClient.create(cfg);
		} catch (err) {
			sem.activeCount--;
			throw err;
		}
	}

	// ── Pool exhausted: queue the caller ────────────────────────────────────
	logger.debug(
		`[ldap-client] Pool exhausted (active=${sem.activeCount}/${sem.maxConnections}), queuing request`,
	);

	return new Promise((resolve, reject) => {
		let waiter;

		const timer = setTimeout(() => {
			const idx = sem.waiters.indexOf(waiter);
			if (idx !== -1) {
				sem.waiters.splice(idx, 1);
			}
			reject(
				new Error(
					`LDAP connection pool exhausted: no free slot after ${sem.acquireTimeout}ms` +
					` (max=${sem.maxConnections})`,
				),
			);
		}, sem.acquireTimeout);

		waiter = { resolve, reject, timer };
		sem.waiters.push(waiter);
	});
};

/**
 * Return a client to the pool.
 *
 * If callers are queued (pool was exhausted at borrow time), the first waiter
 * is fulfilled immediately — the active slot transfers directly from the
 * returning caller to the waiting caller without touching activeCount.
 *
 * If no callers are waiting:
 *   - Live clients are kept in the idle array (up to `maxSize`).
 *   - Clients over the idle cap are destroyed.
 *   - The semaphore active count is decremented.
 *
 * For destroyed clients (lost connection mid-use), a replacement connection
 * is created asynchronously for any queued waiter; otherwise the active slot
 * is simply released.
 *
 * @param  {Object}     cfg
 * @param  {LdapClient} client
 * @param  {number}     [maxSize=5]      Max idle connections to keep
 * @param  {number}     [idleTimeoutMs]
 */
const returnToPool = (cfg, client, maxSize = 5, idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS) => {
	const key = poolKey(cfg);
	const sem = semaphores.get(key);

	if (client._destroyed) {
		// Dead connection — release (or transfer) the semaphore slot
		if (sem) {
			if (sem.waiters.length > 0) {
				// A caller is waiting.  The slot stays allocated; create a fresh
				// connection for the waiter asynchronously.
				const waiter = sem.waiters.shift();
				clearTimeout(waiter.timer);
				LdapClient.create(cfg)
					.then(waiter.resolve)
					.catch((err) => {
						// Failed to create replacement — release slot and fail waiter
						sem.activeCount = Math.max(0, sem.activeCount - 1);
						waiter.reject(err);
					});
			} else {
				sem.activeCount = Math.max(0, sem.activeCount - 1);
			}
		}
		return;
	}

	// ── Live connection ─────────────────────────────────────────────────────

	// Wake a waiting caller by handing the connection directly (slot transfers)
	if (sem && sem.waiters.length > 0) {
		const waiter = sem.waiters.shift();
		clearTimeout(waiter.timer);
		client._lastUsed = Date.now();
		waiter.resolve(client);
		return;
	}

	// Decrement active count before returning to idle
	if (sem) {
		sem.activeCount = Math.max(0, sem.activeCount - 1);
	}

	const pool = pools.get(key) ?? [];

	if (pool.length < maxSize) {
		client._lastUsed = Date.now();
		pool.push(client);
		pools.set(key, pool);

		// Ensure the idle reaper is running for this pool
		startReaper(key, idleTimeoutMs);
	} else {
		client.destroy();
	}
};

// ---------------------------------------------------------------------------
// Public API class
// ---------------------------------------------------------------------------

class LdapClient {
	/** @private */
	constructor(rawClient) {
		this._client    = rawClient;
		this._destroyed = false;
		this._lastUsed  = Date.now();

		// Mark client as destroyed if the underlying connection drops
		rawClient.on("error", (err) => {
			logger.warn(`[ldap-client] Connection error: ${mapLdapError(err)}`);
			this._destroyed = true;
		});

		rawClient.on("close", () => {
			this._destroyed = true;
		});

		rawClient.on("end", () => {
			this._destroyed = true;
		});
	}

	/**
	 * Create and (optionally) STARTTLS-upgrade a client, then bind with the
	 * service account credentials.
	 *
	 * @param  {Object}  cfg
	 * @param  {string}  cfg.serverUrl        ldap:// or ldaps:// URL
	 * @param  {string}  [cfg.bindDN]         Service account DN (anonymous if omitted)
	 * @param  {string}  [cfg.bindPassword]   Service account password
	 * @param  {boolean} [cfg.starttls]       Upgrade to TLS via STARTTLS
	 * @param  {boolean} [cfg.tlsVerify]      Verify TLS cert (default: true)
	 * @param  {number}  [cfg.connectTimeout] ms, default 10 000
	 * @param  {number}  [cfg.opTimeout]      ms per operation, default 15 000
	 * @param  {number}  [cfg.keepAliveMs]    TCP keep-alive probe interval, default 30 000
	 * @returns {Promise<LdapClient>}
	 */
	static async create(cfg) {
		logger.debug(`[ldap-client] Connecting to ${cfg.serverUrl}`);

		const rawClient = await createRawClient(cfg);

		// Enable TCP keep-alive so the OS detects silently-dropped connections
		enableKeepAlive(rawClient, cfg.keepAliveMs ?? DEFAULT_KEEP_ALIVE_MS);

		const client = new LdapClient(rawClient);

		// Wrap post-connection operations (STARTTLS, bind) so that the raw TCP
		// socket is always destroyed on failure.  Without this, a failed upgrade
		// or bind would leave a dangling socket until the OS eventually cleans it
		// up (bounded by the connection-pool semaphore, but still a resource leak).
		try {
			// STARTTLS upgrade (only valid for ldap://, not ldaps://)
			if (cfg.starttls && !cfg.serverUrl.startsWith("ldaps:")) {
				await client._starttls(cfg.tlsVerify !== false);
			}

			// Bind (anonymous if no bindDN supplied)
			if (cfg.bindDN) {
				await client.bind(cfg.bindDN, cfg.bindPassword ?? "");
			}
		} catch (err) {
			rawClient.destroy();
			throw err;
		}

		return client;
	}

	/**
	 * Perform STARTTLS upgrade on an existing connection.
	 *
	 * @param  {boolean} verify  Whether to verify server certificate
	 * @returns {Promise<void>}
	 * @private
	 */
	_starttls(verify) {
		return new Promise((resolve, reject) => {
			const tlsOpts = {
				rejectUnauthorized: verify,
			};
			this._client.starttls(tlsOpts, null, (err) => {
				if (err) {
					reject(new Error(`STARTTLS failed: ${mapLdapError(err)}`));
				} else {
					resolve();
				}
			});
		});
	}

	/**
	 * Perform a simple bind.
	 *
	 * @param  {string} dn
	 * @param  {string} password
	 * @returns {Promise<void>}
	 */
	async bind(dn, password) {
		this._lastUsed = Date.now();
		return bindClient(this._client, dn, password);
	}

	/**
	 * Execute an LDAP search and return all matching entries as plain objects.
	 *
	 * @param  {string} base
	 * @param  {Object} opts   ldapjs SearchOptions
	 * @returns {Promise<Object[]>}
	 */
	async search(base, opts) {
		this._lastUsed = Date.now();
		return searchClient(this._client, base, opts);
	}

	/**
	 * Execute a paged LDAP search (RFC 2696 Paged Results Control) and stream
	 * results one page at a time via the `pageHandler` callback.
	 *
	 * Unlike `search()`, this method does NOT accumulate all entries in memory.
	 * Instead it calls `pageHandler(entries)` at the end of each page and waits
	 * for the handler to resolve before requesting the next page.  This allows
	 * callers to flush each page to the database before fetching the next one,
	 * keeping memory usage proportional to `pageSize` rather than total result set.
	 *
	 * If the LDAP server does not support RFC 2696, ldapjs falls back to a single
	 * un-paged search; in that case all entries arrive via the `end` flush below.
	 *
	 * @param  {string}   base                  Search base DN
	 * @param  {Object}   opts                  ldapjs SearchOptions (without `paged`)
	 * @param  {number}   [opts.pageSize=500]   Entries per page (RFC 2696 page size)
	 * @param  {Function} pageHandler           Async callback invoked per page.
	 *                                          Signature: `async (entries: Object[]) => void`
	 * @returns {Promise<void>}
	 */
	searchPaged(base, opts, pageHandler) {
		this._lastUsed = Date.now();

		const { pageSize = 500, ...restOpts } = opts;

		return new Promise((resolve, reject) => {
			const searchOpts = {
				...restOpts,
				paged: { pageSize, pagePause: true },
			};

			let pageEntries = [];
			let settled     = false;

			const fail = (err) => {
				if (!settled) {
					settled = true;
					reject(err instanceof Error ? err : new Error(String(err)));
				}
			};

			this._client.search(base, searchOpts, (err, res) => {
				if (err) {
					fail(new Error(mapLdapError(err)));
					return;
				}

				res.on("searchEntry", (entry) => {
					const obj = { dn: entry.dn.toString() };
					for (const attr of entry.attributes) {
						const vals = attr.values;
						obj[attr.type] = vals.length === 1 ? vals[0] : vals;
					}
					pageEntries.push(obj);
				});

				res.on("searchReference", (referral) => {
					logger.debug(`[ldap-client] searchPaged: skipping referral: ${referral.uris.join(", ")}`);
				});

				// ldapjs emits 'page' at the end of each page when pagePause=true.
				// The second argument (next) must be called to request the next page.
				res.on("page", (_result, next) => {
					const batch = pageEntries;
					pageEntries = [];

					// Await the handler, then resume paging.
					Promise.resolve()
						.then(() => pageHandler(batch))
						.then(() => {
							if (typeof next === "function") {
								next(); // request next page
							}
						})
						.catch(fail);
				});

				res.on("error", (searchErr) => {
					fail(new Error(mapLdapError(searchErr)));
				});

				res.on("end", async (result) => {
					if (result && result.status !== 0) {
						fail(new Error(`LDAP search ended with status ${result.status}`));
						return;
					}

					// Flush entries that arrived without a preceding 'page' event.
					// This happens when the server does not support RFC 2696 paging.
					if (pageEntries.length > 0) {
						try {
							await pageHandler(pageEntries);
							pageEntries = [];
						} catch (handlerErr) {
							fail(handlerErr);
							return;
						}
					}

					if (!settled) {
						settled = true;
						resolve();
					}
				});
			});
		});
	}

	/**
	 * Gracefully unbind and close the connection.
	 */
	destroy() {
		if (!this._destroyed) {
			this._destroyed = true;
			try {
				this._client.unbind();
			} catch (_) {
				// ignore
			}
		}
	}
}

// Attach helpers so callers can access them without importing separately
LdapClient.mapLdapError    = mapLdapError;
LdapClient.borrowFromPool  = borrowFromPool;
LdapClient.returnToPool    = returnToPool;
LdapClient.stopReaper      = stopReaper;
LdapClient.isSocketHealthy = isSocketHealthy;

// Export constants for testing / external configuration
LdapClient.DEFAULT_KEEP_ALIVE_MS     = DEFAULT_KEEP_ALIVE_MS;
LdapClient.DEFAULT_IDLE_TIMEOUT_MS   = DEFAULT_IDLE_TIMEOUT_MS;
LdapClient.REAPER_INTERVAL_MS        = REAPER_INTERVAL_MS;
LdapClient.DEFAULT_MAX_CONNECTIONS   = DEFAULT_MAX_CONNECTIONS;
LdapClient.DEFAULT_ACQUIRE_TIMEOUT_MS = DEFAULT_ACQUIRE_TIMEOUT_MS;

export default LdapClient;
export {
	mapLdapError,
	borrowFromPool,
	returnToPool,
	stopReaper,
	isSocketHealthy,
	enableKeepAlive,
	pools,
	reaperHandles,
	semaphores,
	DEFAULT_KEEP_ALIVE_MS,
	DEFAULT_IDLE_TIMEOUT_MS,
	REAPER_INTERVAL_MS,
	DEFAULT_MAX_CONNECTIONS,
	DEFAULT_ACQUIRE_TIMEOUT_MS,
};
