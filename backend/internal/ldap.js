/**
 * High-level LDAP authentication and directory operations.
 *
 * Config object shape expected by every public function:
 * {
 *   serverUrl:     string   — e.g. "ldap://dc.example.com" or "ldaps://..."
 *   bindDN:        string   — service-account DN used for searches
 *   bindPassword:  string   — service-account password
 *   searchBase:    string   — base DN for user/group searches
 *   userAttribute: string   — attribute used to locate users (default: "uid")
 *                             Common values: "uid" (OpenLDAP), "sAMAccountName" (AD),
 *                             "mail", "userPrincipalName"
 *   groupDN:       string   — base DN (or specific group DN) for group membership search
 *   tlsVerify:     boolean  — reject self-signed TLS certs (default: true)
 *   starttls:      boolean  — upgrade ldap:// connection via STARTTLS
 *   followReferrals: boolean — follow LDAP referrals (useful for AD forests)
 *   connectTimeout: number  — ms, default 10 000
 *   opTimeout:     number   — ms per operation, default 15 000
 * }
 *
 * All functions are async and resolve to plain objects / arrays.
 * They reject with human-readable Error instances (see mapLdapError in ldap-client.js).
 */

import errs from "../lib/error.js";
import { ldap as logger } from "../logger.js";
import LdapClient, { borrowFromPool, returnToPool } from "../lib/ldap-client.js";

// ---------------------------------------------------------------------------
// Login semaphore — limits concurrent user-bind connections per server
// ---------------------------------------------------------------------------

/**
 * Default cap on simultaneous user-bind (login) connections per LDAP server.
 *
 * A separate semaphore from the service-account pool is used because user
 * binds use different credentials (one per login attempt) and are immediately
 * destroyed — they must never be recycled into the idle pool.
 *
 * Override at runtime via the `LDAP_MAX_LOGIN_CONNECTIONS` environment
 * variable (parsed once at module load).
 */
const DEFAULT_MAX_LOGIN_CONNECTIONS =
	parseInt(process.env.LDAP_MAX_LOGIN_CONNECTIONS, 10) || 10;

/**
 * How long (ms) a queued login request waits for a slot before rejecting.
 * Override via `LDAP_LOGIN_ACQUIRE_TIMEOUT_MS`.
 */
const DEFAULT_LOGIN_ACQUIRE_TIMEOUT_MS =
	parseInt(process.env.LDAP_LOGIN_ACQUIRE_TIMEOUT_MS, 10) || 5_000;

/**
 * Per-server-URL semaphore state for login (user-bind) connections.
 *
 * Shape: { activeCount: number, waiters: Array<{resolve, reject, timer}>,
 *          maxConnections: number, acquireTimeout: number }
 *
 * Exported for testing (tests can clear or pre-seed the Map).
 */
const loginSemaphores = new Map();

/**
 * Return (creating if needed) the login semaphore for a server URL.
 *
 * @param  {string} serverUrl
 * @returns {{ activeCount, waiters, maxConnections, acquireTimeout }}
 */
const getLoginSemaphore = (serverUrl) => {
	if (!loginSemaphores.has(serverUrl)) {
		loginSemaphores.set(serverUrl, {
			activeCount:    0,
			waiters:        [],
			maxConnections: DEFAULT_MAX_LOGIN_CONNECTIONS,
			acquireTimeout: DEFAULT_LOGIN_ACQUIRE_TIMEOUT_MS,
		});
	}
	return loginSemaphores.get(serverUrl);
};

/**
 * Acquire a login slot for the given server URL.
 *
 * If the concurrency cap has not been reached the slot is granted immediately.
 * Otherwise the call is queued and waits up to `acquireTimeout` ms before
 * rejecting, so burst login traffic degrades gracefully without exhausting
 * OS sockets.
 *
 * @param  {string} serverUrl
 * @returns {Promise<void>}
 */
const acquireLoginSlot = (serverUrl) => {
	const sem = getLoginSemaphore(serverUrl);

	if (sem.activeCount < sem.maxConnections) {
		sem.activeCount++;
		return Promise.resolve();
	}

	logger.debug(
		`[ldap] Login semaphore exhausted (active=${sem.activeCount}/${sem.maxConnections}), queuing request`,
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
					`LDAP login limit exceeded: no slot available after ${sem.acquireTimeout}ms` +
					` (max=${sem.maxConnections})`,
				),
			);
		}, sem.acquireTimeout);

		waiter = { resolve, reject, timer };
		sem.waiters.push(waiter);
	});
};

/**
 * Release a login slot, waking the first queued caller if any.
 *
 * If callers are queued the active-count stays the same — the slot transfers
 * directly to the next waiter.  Otherwise the count is decremented.
 *
 * @param  {string} serverUrl
 */
const releaseLoginSlot = (serverUrl) => {
	const sem = loginSemaphores.get(serverUrl);
	if (!sem) {
		return;
	}

	if (sem.waiters.length > 0) {
		const waiter = sem.waiters.shift();
		clearTimeout(waiter.timer);
		// Slot transfers — activeCount stays the same
		waiter.resolve();
	} else {
		sem.activeCount = Math.max(0, sem.activeCount - 1);
	}
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an LDAP search filter that locates a user by the configured attribute(s).
 *
 * When `loginAttributes` is a comma-separated list (e.g. "uid,mail,sAMAccountName,cn")
 * an OR filter is built so users can authenticate with any of the listed attributes.
 * Single-attribute config continues to work as before.
 *
 * @param  {string} userAttribute    Primary attribute (e.g. "uid", "sAMAccountName")
 * @param  {string} username         Value to match
 * @param  {string} [loginAttributes] Optional comma-separated list of attributes to try
 * @returns {string} LDAP filter string
 */
const buildUserFilter = (userAttribute, username, loginAttributes) => {
	// Escape special LDAP filter characters per RFC 4515
	const escape = (v) => v.replace(/[\\*()]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
	const escaped = escape(username);

	// Parse the login-attributes list (may be provided by config or env var)
	const attrs = loginAttributes
		? loginAttributes.split(",").map((a) => a.trim()).filter(Boolean)
		: [];

	// Deduplicate: ensure the primary userAttribute is always included
	if (!attrs.includes(userAttribute)) {
		attrs.unshift(userAttribute);
	}

	if (attrs.length === 1) {
		// Fast path: single attribute filter
		return `(${attrs[0]}=${escaped})`;
	}

	// Multi-attribute OR filter
	return `(|${attrs.map((a) => `(${a}=${escaped})`).join("")})`;
};

/**
 * Build the group membership filter.
 *
 * For Active Directory:   (member=<userDN>)
 * For OpenLDAP (posix):   (memberUid=<username>)
 *
 * We try member first; posix groups use memberUid.
 * Callers can pass a combined filter via groupFilter config if needed.
 *
 * @param  {string} userDN
 * @param  {string} [username]
 * @returns {string}
 */
const buildGroupMemberFilter = (userDN, username) => {
	// RFC 2307 / AD compatible OR-filter
	const parts = [`(member=${userDN})`, `(uniqueMember=${userDN})`];
	if (username) {
		parts.push(`(memberUid=${username})`);
	}
	return `(|${parts.join("")})`;
};

/**
 * Execute a function with a pooled LDAP client that is bound as the
 * service account.  The client is automatically returned to the pool
 * (or destroyed on error) after the callback resolves.
 *
 * @template T
 * @param  {Object}                       cfg
 * @param  {function(LdapClient): Promise<T>} fn
 * @returns {Promise<T>}
 */
const withServiceClient = async (cfg, fn) => {
	const client = await borrowFromPool(cfg);
	let returned = false;
	try {
		const result = await fn(client);
		returnToPool(cfg, client);
		returned = true;
		return result;
	} finally {
		if (!returned) {
			// Destroy the connection — it may be in an unknown state after an error.
			// destroy() sets client._destroyed = true so returnToPool correctly
			// releases (or transfers) the semaphore slot instead of recycling
			// the dead connection.
			client.destroy();
			returnToPool(cfg, client);
		}
	}
};

// ---------------------------------------------------------------------------
// Active Directory paging control helper
// ---------------------------------------------------------------------------

/**
 * Default page size for AD paged searches.
 * ldapjs supports paging via SearchOptions.paged.
 */
const AD_PAGE_SIZE = 200;

/**
 * Build ldapjs SearchOptions with AD paging enabled if requested.
 *
 * @param  {Object}  opts     Base search options
 * @param  {boolean} paged    Whether to enable paging
 * @returns {Object}
 */
const withPaging = (opts, paged) => {
	if (!paged) {
		return opts;
	}
	return {
		...opts,
		paged: { pageSize: AD_PAGE_SIZE },
	};
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const internalLdap = {
	/**
	 * Verify that the LDAP server is reachable and the service account can bind.
	 *
	 * @param  {Object} config
	 * @returns {Promise<{ success: boolean, message: string }>}
	 */
	testConnection: async (config) => {
		logger.info(`[ldap] Testing connection to ${config.serverUrl}`);

		let client = null;
		try {
			client = await LdapClient.create(config);
			client.destroy();
			logger.info(`[ldap] Connection test OK: ${config.serverUrl}`);
			return { success: true, message: "Connection successful" };
		} catch (err) {
			if (client) {
				client.destroy();
			}
			logger.warn(`[ldap] Connection test failed: ${err.message}`);
			return { success: false, message: err.message };
		}
	},

	/**
	 * Search for a single user by username.
	 *
	 * Uses the service account (bindDN/bindPassword) to perform the search.
	 * Returns the first matching entry or null if not found.
	 *
	 * @param  {Object} config
	 * @param  {string} username  — value to match against config.userAttribute
	 * @returns {Promise<Object|null>}  plain attribute object (including dn) or null
	 */
	searchUser: async (config, username) => {
		const userAttribute = config.userAttribute || "uid";
		const filter        = buildUserFilter(userAttribute, username, config.loginAttributes);

		logger.debug(`[ldap] Searching for user "${username}" (filter: ${filter})`);

		const searchOpts = withPaging(
			{
				scope:      "sub",
				filter:     filter,
				attributes: [
					"dn", "cn", "mail", "userPrincipalName", "displayName",
					"memberOf", "givenName", "sn",
					// Include all login-attribute columns so the user entry is fully populated
					...(config.loginAttributes
						? config.loginAttributes.split(",").map((a) => a.trim()).filter(Boolean)
						: []),
					"objectGUID",   // Active Directory stable GUID (binary, decoded as hex string)
					"entryUUID",    // OpenLDAP / RFC 4530 stable UUID
					userAttribute,
				],
				sizeLimit:  2, // We only expect one — detect ambiguity
			},
			config.adPaging ?? false,
		);

		let entries;
		try {
			entries = await withServiceClient(config, (client) =>
				client.search(config.searchBase, searchOpts),
			);
		} catch (err) {
			throw new errs.AuthError(`LDAP user search failed: ${err.message}`);
		}

		if (entries.length === 0) {
			logger.debug(`[ldap] User "${username}" not found`);
			return null;
		}

		if (entries.length > 1) {
			logger.warn(`[ldap] Ambiguous result: ${entries.length} entries match "${username}"`);
			// Return the first match (most directories guarantee uniqueness anyway)
		}

		return entries[0];
	},

	/**
	 * Authenticate a user: search for them, then bind as that user.
	 *
	 * Flow:
	 *   1. Service account searches for the user to get their full DN
	 *   2. A new connection is made and a simple bind is attempted as that user
	 *   3. On success, the user's attributes are returned
	 *
	 * @param  {Object} config
	 * @param  {string} username   — login name (matched via config.userAttribute)
	 * @param  {string} password   — user's LDAP password
	 * @returns {Promise<Object>}  — user attributes on success
	 * @throws {errs.AuthError}    — on invalid credentials or user not found
	 */
	authenticateUser: async (config, username, password) => {
		if (!username || !password) {
			throw new errs.AuthError("Username and password are required");
		}

		// Step 1 — find the user
		const userEntry = await internalLdap.searchUser(config, username);
		if (!userEntry) {
			logger.warn(`[ldap] Authentication failed: user "${username}" not found`);
			throw new errs.AuthError("Invalid credentials");
		}

		const userDN = userEntry.dn;
		logger.debug(`[ldap] Found user DN: ${userDN}, attempting bind`);

		// Step 2 — bind as the user (creates a fresh, short-lived connection).
		//
		// The login semaphore caps concurrent user-bind connections so a burst of
		// logins cannot exhaust OS sockets.  The user-bind client is always
		// destroyed and the slot always released via the finally block, whether
		// the bind succeeded or threw.
		await acquireLoginSlot(config.serverUrl);
		let userClient = null;
		try {
			// Create a user-client config that reuses all TLS/timeout settings
			// but authenticates as the discovered user.
			const userCfg = {
				...config,
				bindDN:       userDN,
				bindPassword: password,
			};
			userClient = await LdapClient.create(userCfg);
			// We only needed the bind to succeed; the connection is not reused.
		} catch (err) {
			logger.warn(`[ldap] Bind failed for "${userDN}": ${err.message}`);
			// Map LDAP 49 (invalidCredentials) to a generic message
			throw new errs.AuthError("Invalid credentials");
		} finally {
			// Always destroy the user-bind client and release the semaphore slot,
			// whether the bind succeeded, failed, or threw after partial setup.
			if (userClient) {
				userClient.destroy();
			}
			releaseLoginSlot(config.serverUrl);
		}

		logger.info(`[ldap] Authenticated user "${username}" (${userDN})`);
		return userEntry;
	},

	/**
	 * Retrieve group memberships for a given user DN.
	 *
	 * Searches config.groupDN (or config.searchBase) for entries that
	 * have the user as a member (supports AD member, POSIX memberUid,
	 * and RFC 2307 uniqueMember).
	 *
	 * @param  {Object} config
	 * @param  {string} userDN    — full DN of the user
	 * @param  {string} [username] — short username (for posixGroup memberUid lookup)
	 * @returns {Promise<Object[]>} array of group attribute objects
	 */
	getUserGroups: async (config, userDN, username) => {
		const base   = config.groupDN || config.searchBase;
		const filter = buildGroupMemberFilter(userDN, username);

		logger.debug(`[ldap] Fetching groups for "${userDN}" (filter: ${filter})`);

		const searchOpts = withPaging(
			{
				scope:      "sub",
				filter:     filter,
				attributes: ["dn", "cn", "description", "member", "memberUid"],
			},
			config.adPaging ?? false,
		);

		try {
			return await withServiceClient(config, (client) =>
				client.search(base, searchOpts),
			);
		} catch (err) {
			// Group lookup is advisory — log but don't throw
			logger.warn(`[ldap] Group lookup failed for "${userDN}": ${err.message}`);
			return [];
		}
	},

	/**
	 * Check whether a user is a member of a specific group (by DN or CN).
	 *
	 * @param  {Object}   config
	 * @param  {string}   userDN      — user's full DN
	 * @param  {string}   groupIdentifier — group DN or common name
	 * @param  {string}   [username]  — short username for posixGroup lookup
	 * @returns {Promise<boolean>}
	 */
	isUserInGroup: async (config, userDN, groupIdentifier, username) => {
		const groups = await internalLdap.getUserGroups(config, userDN, username);

		return groups.some((g) => {
			const dn = (g.dn || "").toLowerCase();
			const cn = (g.cn  || "").toLowerCase();
			const id = groupIdentifier.toLowerCase();
			return dn === id || dn.startsWith(`cn=${id},`) || cn === id;
		});
	},

	/**
	 * Validate a config object for minimum required fields.
	 *
	 * @param  {Object} config
	 * @throws {errs.ValidationError}
	 */
	validateConfig: (config) => {
		const required = ["serverUrl", "searchBase"];
		for (const field of required) {
			if (!config[field]) {
				throw new errs.ValidationError(`LDAP config missing required field: ${field}`);
			}
		}

		// Validate URL scheme
		if (!config.serverUrl.startsWith("ldap://") && !config.serverUrl.startsWith("ldaps://")) {
			throw new errs.ValidationError("serverUrl must start with ldap:// or ldaps://");
		}

		// STARTTLS + LDAPS is a misconfiguration
		if (config.starttls && config.serverUrl.startsWith("ldaps:")) {
			throw new errs.ValidationError("STARTTLS cannot be used with ldaps:// — use ldap:// or disable starttls");
		}
	},

	/**
	 * Fetch a single LDAP entry by its exact Distinguished Name.
	 *
	 * Used by backfillGuids to retrieve objectGUID/entryUUID for known DNs.
	 *
	 * @param  {Object} config
	 * @param  {string} dn       Full Distinguished Name of the entry
	 * @returns {Promise<Object[]>}  Array of matching entries (usually 0 or 1)
	 */
	searchByDN: async (config, dn) => {
		logger.debug(`[ldap] searchByDN: looking up "${dn}"`);

		const searchOpts = {
			scope:      "base",   // Exact DN match — no subtree traversal
			filter:     "(objectClass=*)",
			attributes: [
				"dn", "cn", "mail", "userPrincipalName", "displayName",
				"givenName", "sn",
				"objectGUID",
				"entryUUID",
			],
		};

		try {
			return await withServiceClient(config, (client) =>
				client.search(dn, searchOpts),
			);
		} catch (err) {
			logger.warn(`[ldap] searchByDN: failed for "${dn}": ${err.message}`);
			return [];
		}
	},


	/**
	 * Map raw LDAP user attributes to a normalised object that can be
	 * used across the rest of NPM (e.g. to look up or create a local user).
	 *
	 * @param  {Object} ldapEntry   — raw entry from searchUser / authenticateUser
	 * @param  {string} userAttribute — the attribute used as the login identity
	 * @returns {Object}
	 */
	normalizeUser: (ldapEntry, userAttribute) => {
		// Extract stable GUID: objectGUID (AD, binary Buffer → hex) or entryUUID (OpenLDAP, already a string)
		let ldapGuid = null;
		if (ldapEntry.objectGUID) {
			// AD returns objectGUID as a raw Buffer; convert to lowercase hex string for storage
			const raw = ldapEntry.objectGUID;
			if (Buffer.isBuffer(raw)) {
				ldapGuid = raw.toString("hex");
			} else if (typeof raw === "string") {
				// Some ldapjs versions decode it as a string — normalise to hex
				ldapGuid = Buffer.from(raw, "binary").toString("hex");
			}
		} else if (ldapEntry.entryUUID) {
			// OpenLDAP entryUUID is already a hyphenated UUID string
			ldapGuid = String(ldapEntry.entryUUID).toLowerCase();
		}

		return {
			dn:          ldapEntry.dn,
			ldapGuid,    // Stable directory identifier — objectGUID (AD) or entryUUID (OpenLDAP)
			username:    ldapEntry[userAttribute || "uid"] || "",
			email:       ldapEntry.mail || ldapEntry.userPrincipalName || "",
			displayName: ldapEntry.displayName || ldapEntry.cn || "",
			givenName:   ldapEntry.givenName || "",
			surname:     ldapEntry.sn || "",
			// Raw groups (if already fetched via memberOf — AD populates this)
			memberOf:    Array.isArray(ldapEntry.memberOf)
				? ldapEntry.memberOf
				: ldapEntry.memberOf
					? [ldapEntry.memberOf]
					: [],
		};
	},

	/**
	 * Enumerate ALL user entries in the LDAP directory using RFC 2696 Paged
	 * Results Control to bound memory usage.
	 *
	 * Instead of accumulating every entry into a single array (which causes OOM
	 * for large directories), this function processes the results one page at a
	 * time: `pageHandler` is called with each batch and must resolve before the
	 * next page is requested from the server.
	 *
	 * The LDAP search filter is taken from `config.userFilter` when provided,
	 * otherwise a broad filter matching all objectClass=person entries is used.
	 *
	 * @param  {Object}   config              LDAP config object (camelCase)
	 * @param  {Function} pageHandler         Async callback invoked per page.
	 *                                        Signature: `async (entries: Object[]) => void`
	 * @param  {number}   [pageSize=500]      RFC 2696 page size (entries per page)
	 * @returns {Promise<void>}
	 */
	searchAllUsers: async (config, pageHandler, pageSize = 500) => {
		const userAttribute = config.userAttribute || "uid";
		// Use the admin-configured filter or fall back to a sensible default
		const filter        = config.userFilter || `(${userAttribute}=*)`;

		logger.info(`[ldap] searchAllUsers: paged scan of "${config.searchBase}" filter="${filter}" pageSize=${pageSize}`);

		const searchOpts = {
			scope:      "sub",
			filter,
			attributes: [
				"dn", "cn", "mail", "userPrincipalName",
				"displayName", "memberOf",
				"givenName", "sn",
				"objectGUID",   // Active Directory stable GUID
				"entryUUID",    // OpenLDAP / RFC 4530 stable UUID
				userAttribute,
			],
			pageSize,
		};

		try {
			await withServiceClient(config, (client) =>
				client.searchPaged(config.searchBase, searchOpts, pageHandler),
			);
		} catch (err) {
			throw new Error(`LDAP directory scan failed: ${err.message}`);
		}
	},
};

export default internalLdap;
export {
	loginSemaphores,
	getLoginSemaphore,
	acquireLoginSlot,
	releaseLoginSlot,
	DEFAULT_MAX_LOGIN_CONNECTIONS,
	DEFAULT_LOGIN_ACQUIRE_TIMEOUT_MS,
};
