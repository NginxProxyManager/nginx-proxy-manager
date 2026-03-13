/** High-level LDAP authentication and directory operations. */

import errs from "../lib/error.js";
import { ldap as logger } from "../logger.js";
import LdapClient, { borrowFromPool, returnToPool } from "../lib/ldap-client.js";

// ---------------------------------------------------------------------------
// Login semaphore — limits concurrent user-bind connections per server
// ---------------------------------------------------------------------------

/** Default cap on simultaneous user-bind (login) connections per server. */
const DEFAULT_MAX_LOGIN_CONNECTIONS =
	Number.parseInt(process.env.LDAP_MAX_LOGIN_CONNECTIONS, 10) || 10;

/** Queued login slot timeout (ms). */
const DEFAULT_LOGIN_ACQUIRE_TIMEOUT_MS =
	Number.parseInt(process.env.LDAP_LOGIN_ACQUIRE_TIMEOUT_MS, 10) || 5_000;

/** Per-server login semaphore state. Exported for testing. */
const loginSemaphores = new Map();

/** Get or create login semaphore for a server URL. */
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

/** Acquire a login slot (queues if at capacity). */
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

/** Release a login slot, waking queued callers if any. */
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
// Active Directory objectGUID parsing
// ---------------------------------------------------------------------------

/**
 * Parse AD objectGUID (16 bytes, mixed-endian) to standard hyphenated GUID.
 * Bytes 0-3/4-5/6-7 are little-endian; 8-15 are big-endian.
 */
const parseObjectGUID = (rawBuf) => {
	// Normalise input to a Buffer
	const buf = typeof rawBuf === "string" ? Buffer.from(rawBuf, "binary") : rawBuf;
	if (!Buffer.isBuffer(buf) || buf.length !== 16) {
		throw new Error(`objectGUID must be exactly 16 bytes, got ${Buffer.isBuffer(buf) ? buf.length : typeof buf}`);
	}

	// Data1: bytes 0-3, little-endian -> reverse
	const d1 = Buffer.from([buf[3], buf[2], buf[1], buf[0]]).toString("hex");
	// Data2: bytes 4-5, little-endian -> reverse
	const d2 = Buffer.from([buf[5], buf[4]]).toString("hex");
	// Data3: bytes 6-7, little-endian -> reverse
	const d3 = Buffer.from([buf[7], buf[6]]).toString("hex");
	// Data4a: bytes 8-9, big-endian (no swap)
	const d4a = Buffer.from([buf[8], buf[9]]).toString("hex");
	// Data4b: bytes 10-15, big-endian (no swap)
	const d4b = Buffer.from([buf[10], buf[11], buf[12], buf[13], buf[14], buf[15]]).toString("hex");

	return `${d1}-${d2}-${d3}-${d4a}-${d4b}`;
};

/** Encode hyphenated GUID back to AD binary-escaped LDAP filter (\\xx format). */
const guidToLdapFilter = (guid) => {
	const hex = guid.replace(/-/g, "");
	if (hex.length !== 32) {
		throw new Error(`Invalid GUID format: "${guid}"`);
	}

	// Reverse the endian-swap: GUID string -> mixed-endian binary bytes
	const d1 = hex.slice(0, 8);
	const d2 = hex.slice(8, 12);
	const d3 = hex.slice(12, 16);
	const d4 = hex.slice(16, 32);

	// Reverse first three groups back to little-endian byte order
	const bytes = [
		d1.slice(6, 8), d1.slice(4, 6), d1.slice(2, 4), d1.slice(0, 2), // Data1 LE
		d2.slice(2, 4), d2.slice(0, 2),                                   // Data2 LE
		d3.slice(2, 4), d3.slice(0, 2),                                   // Data3 LE
	];
	// Data4 bytes in order (big-endian, no swap)
	for (let i = 0; i < d4.length; i += 2) {
		bytes.push(d4.slice(i, i + 2));
	}

	return bytes.map((b) => `\\${b}`).join("");
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build LDAP user search filter (supports multi-attribute OR). */
// Escape special LDAP filter characters per RFC 4515
const escapeLdap = (v) => v.replace(/[\\*()]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, "0")}`);

const buildUserFilter = (userAttribute, username, loginAttributes) => {
	const escaped = escapeLdap(username);

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

/** Build group membership filter (AD member + POSIX memberUid + uniqueMember). */
const buildGroupMemberFilter = (userDN, username) => {
	// RFC 2307 / AD compatible OR-filter — escape per RFC 4515 (defense-in-depth)
	const escapedDN = escapeLdap(userDN);
	const parts = [`(member=${escapedDN})`, `(uniqueMember=${escapedDN})`];
	if (username) {
		parts.push(`(memberUid=${escapeLdap(username)})`);
	}
	return `(|${parts.join("")})`;
};

/** Execute fn with a pooled service-account client (auto-returned/destroyed). */
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

/** Default page size for AD paged searches. */
const AD_PAGE_SIZE = 200;

/** Add paging options to ldapjs SearchOptions. */
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
	/** Test LDAP connectivity (service account bind). */
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

	/** Authenticate: search user → bind as user → return attributes. */
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

	/** Fetch group memberships for a user DN (AD/POSIX/RFC2307). */
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

	/** Check if user is in a specific group (by DN or CN). */
	isUserInGroup: async (config, userDN, groupIdentifier, username) => {
		const groups = await internalLdap.getUserGroups(config, userDN, username);

		return groups.some((g) => {
			const dn = (g.dn || "").toLowerCase();
			const cn = (g.cn  || "").toLowerCase();
			const id = groupIdentifier.toLowerCase();
			return dn === id || dn.startsWith(`cn=${id},`) || cn === id;
		});
	},

	/** Validate minimum required LDAP config fields. */
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

	/** Fetch a single LDAP entry by exact DN. */
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


	/** Search for an LDAP entry by objectGUID (binary-escaped filter). */
	searchByGUID: async (config, guid) => {
		const binaryFilter = guidToLdapFilter(guid);
		const filter = `(objectGUID=${binaryFilter})`;
		logger.debug(`[ldap] searchByGUID: looking up GUID "${guid}" (filter: ${filter})`);

		const searchOpts = {
			scope:      "sub",
			filter:     filter,
			attributes: [
				"dn", "cn", "mail", "userPrincipalName", "displayName",
				"givenName", "sn",
				"objectGUID",
				"entryUUID",
			],
		};

		try {
			return await withServiceClient(config, (client) =>
				client.search(config.searchBase, searchOpts),
			);
		} catch (err) {
			logger.warn(`[ldap] searchByGUID: failed for "${guid}": ${err.message}`);
			return [];
		}
	},

	/** Normalize raw LDAP entry to { dn, ldapGuid, username, email, displayName, ... }. */
	normalizeUser: (ldapEntry, userAttribute) => {
		// Extract stable GUID: objectGUID (AD, binary → standard GUID) or entryUUID (OpenLDAP, already a string)
		let ldapGuid = null;
		if (ldapEntry.objectGUID) {
			// AD returns objectGUID as a 16-byte binary value in mixed-endian format.
			// parseObjectGUID handles the byte-swapping to produce the standard
			// Microsoft GUID string (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).
			const raw = ldapEntry.objectGUID;
			try {
				ldapGuid = parseObjectGUID(raw);
			} catch (err) {
				logger.warn(`[ldap] Failed to parse objectGUID for "${ldapEntry.dn}": ${err.message}`);
				// Fallback: if parsing fails (unexpected length), store raw hex
				if (Buffer.isBuffer(raw)) {
					ldapGuid = raw.toString("hex");
				} else if (typeof raw === "string") {
					ldapGuid = Buffer.from(raw, "binary").toString("hex");
				}
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

	/** Directory-aware default sync filter: AD excludes computers+disabled; OpenLDAP uses inetOrgPerson. */
	buildDefaultSyncFilter: (userAttribute) => {
		const attr = (userAttribute || "uid").toLowerCase();
		const isAD = attr === "samaccountname" || attr === "userprincipalname";

		if (isAD) {
			// Active Directory safe default:
			// - objectClass=user + objectCategory=person → excludes computers
			// - !(userAccountControl:1.2.840.113556.1.4.803:=2) → excludes disabled accounts
			return "(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))";
		}

		// OpenLDAP / generic LDAP safe default:
		// inetOrgPerson is the standard person class, excludes service entries
		return "(objectClass=inetOrgPerson)";
	},

	/** Paged directory scan: calls pageHandler per batch, bounded by pageSize. */
	searchAllUsers: async (config, pageHandler, pageSize = 500) => {
		const userAttribute = config.userAttribute || "uid";
		// Use the admin-configured filter or fall back to a directory-aware safe default
		let filter = config.userFilter || internalLdap.buildDefaultSyncFilter(userAttribute);

		// When syncGroup is configured, wrap the filter with a memberOf condition
		// so only members of the specified group are returned from the directory.
		// This uses AD's memberOf attribute (works for AD and OpenLDAP with memberOf overlay).
		if (config.syncGroup) {
			filter = `(&${filter}(memberOf=${escapeLdap(config.syncGroup)}))`;
			logger.info(`[ldap] searchAllUsers: sync restricted to group "${config.syncGroup}"`);
		}

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
	parseObjectGUID,
	guidToLdapFilter,
	loginSemaphores,
	getLoginSemaphore,
	acquireLoginSlot,
	releaseLoginSlot,
	DEFAULT_MAX_LOGIN_CONNECTIONS,
	DEFAULT_LOGIN_ACQUIRE_TIMEOUT_MS,
	buildGroupMemberFilter,
	buildUserFilter,
	escapeLdap,
};

// Re-export buildDefaultSyncFilter for direct import by tests
export const buildDefaultSyncFilter = internalLdap.buildDefaultSyncFilter;
