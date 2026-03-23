/** Low-level ldapjs wrapper: connection, bind, search, paging, pool, STARTTLS, TCP keep-alive. */

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

/** Binary attributes: use attr.buffers (raw Buffer[]) instead of attr.values to avoid UTF-8 corruption. */
const BINARY_ATTRS = new Set([
	"objectGUID",
	"objectSid",
	"thumbnailPhoto",
	"msExchMailboxGuid",
	"userCertificate",
]);

/** Map ldapjs error codes to human-readable messages. */
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

/** Enable TCP keep-alive on the ldapjs client socket. */
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

/** Build a raw ldapjs client with timeout and TLS config. */
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

/** Promise-wrapped ldapjs bind(). */
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

/** Promise-wrapped ldapjs search() that collects all entries. */
const searchClient = (client, base, options) => {
	return new Promise((resolve, reject) => {
		const entries = [];

		client.search(base, options, (err, res) => {
			if (err) {
				reject(new Error(mapLdapError(err)));
				return;
			}

			res.on("searchEntry", (entry) => {
				// Convert ldapjs Attribute objects to plain key→value pairs.
				// Binary attributes (objectGUID, objectSid, etc.) use attr.buffers
				// (raw Buffer[]) instead of attr.values (UTF-8 decoded strings) to
				// avoid byte corruption when values contain octets ≥ 0x80.
				const obj = { dn: entry.dn.toString() };
				for (const attr of entry.attributes) {
					const name = attr.type;
					const vals = BINARY_ATTRS.has(name) ? attr.buffers : attr.values;
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

/** Connection pool: recycles authenticated service-account clients with health checks. */
const pools = new Map();

/** Per-pool idle reaper interval handles. */
const reaperHandles = new Map();

/** Per-pool semaphore: caps concurrent borrowed connections. */
const semaphores = new Map();

const poolKey = (cfg) =>
	`${cfg.serverUrl}|${cfg.bindDN ?? ""}|${cfg.starttls ? "starttls" : "plain"}`;

/** Get or create semaphore for a pool key. */
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

/** Start idle-connection reaper for a pool (destroys stale connections). */
const startReaper = (key, idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS) => {
	if (reaperHandles.has(key)) {
		return; // already running
	}

	logger.debug(
		`[ldap-client] Reaper started for pool "${key}" ` +
		`(interval=${REAPER_INTERVAL_MS}ms, idleTimeout=${idleTimeoutMs}ms)`,
	);

	const handle = setInterval(() => {
		const pool = pools.get(key);
		if (!pool || pool.length === 0) {
			return;
		}

		logger.debug(
			`[ldap-client] Reaper running for pool "${key}" — checking ${pool.length} pooled connection(s)`,
		);

		const now = Date.now();
		const survivors = [];

		for (const client of pool) {
			const idleMs = now - (client._lastUsed ?? 0);
			if (client._destroyed || idleMs > idleTimeoutMs) {
				client.destroy();
				logger.debug(
					`[ldap-client] Reaped stale connection from pool "${key}" ` +
					`(idle=${idleMs}ms, destroyed=${client._destroyed}, ` +
					`remaining=${survivors.length})`,
				);
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

/** Stop the idle reaper for a pool key (for testing). */
const stopReaper = (key) => {
	const handle = reaperHandles.get(key);
	if (handle) {
		clearInterval(handle);
		reaperHandles.delete(key);
	}
};

/** Socket health check: writable and not destroyed. */
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

/** Borrow a client from pool (health-checked, semaphore-capped). */
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

/** Return client to pool (wake waiters or add to idle array). */
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

	/** Create client: connect → STARTTLS (optional) → bind. */
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

	/** STARTTLS upgrade. @private */
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

	/** Simple bind. */
	async bind(dn, password) {
		this._lastUsed = Date.now();
		return bindClient(this._client, dn, password);
	}

	/** Search and return all matching entries. */
	async search(base, opts) {
		this._lastUsed = Date.now();
		return searchClient(this._client, base, opts);
	}

	/** Paged search (RFC 2696): calls pageHandler per batch, memory-bounded. */
	searchPaged(base, opts, pageHandler) {
		this._lastUsed = Date.now();

		const { pageSize = 500, ...restOpts } = opts;

		return new Promise((resolve, reject) => {
			const searchOpts = {
				...restOpts,
				paged: { pageSize, pagePause: true },
			};

			let pageEntries      = [];
			let settled          = false;
			// Track the most recently spawned page handler promise so that the
			// 'end' event can await it before resolving.  With pagePause=true
			// only one page handler is ever in-flight at a time, but we still
			// need a reference because ldapjs may emit 'end' in the same
			// synchronous tick as the last 'page' event — before the
			// Promise.resolve().then() microtask has had a chance to run.
			let inFlightHandler  = Promise.resolve();

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
					// Binary attributes (objectGUID, objectSid, etc.) use attr.buffers
					// (raw Buffer[]) to avoid UTF-8 corruption of bytes ≥ 0x80.
					const obj = { dn: entry.dn.toString() };
					for (const attr of entry.attributes) {
						const vals = BINARY_ATTRS.has(attr.type) ? attr.buffers : attr.values;
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
					// Store the promise so the 'end' handler can await it.
					inFlightHandler = Promise.resolve()
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

				// 'end' fires after all pages have been delivered.  With pagePause=true
				// ldapjs may emit 'end' in the same synchronous tick as the final 'page'
				// event, before the page handler microtask has run.  We must await
				// inFlightHandler so that:
				//  a) the last page handler has fully committed its DB writes before
				//     step 4 (disable-absent-users) starts in syncAllUsers, and
				//  b) summary counters (synced/provisioned) are accurate.
				res.on("end", async (result) => {
					if (result && result.status !== 0) {
						fail(new Error(`LDAP search ended with status ${result.status}`));
						return;
					}

					// Wait for any in-flight page handler to complete before proceeding.
					// On error the handler already called fail(), so we just return.
					try {
						await inFlightHandler;
					} catch (_) {
						return; // fail() already invoked by the page handler's .catch(fail)
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

	/** Unbind and close. */
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
