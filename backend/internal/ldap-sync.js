/**
 * LDAP JIT (Just-In-Time) User Provisioning
 *
 * Handles creating and updating NPM user accounts on successful LDAP authentication,
 * syncing group memberships to NPM permissions, and disabling accounts when users
 * are removed from the required LDAP group.
 */

import gravatar from "gravatar";
import authModel from "../models/auth.js";
import auditLogModel from "../models/audit-log.js";
import userModel from "../models/user.js";
import userPermissionModel from "../models/user_permission.js";
import LdapConfig from "../models/ldap_config.js";
import { ldap as logger } from "../logger.js";
import now from "../models/now_helper.js";
import internalLdap, { parseObjectGUID } from "./ldap.js";
import { applyEnvOverrides } from "../lib/ldap-env.js";
import db from "../db.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when a Knex / database error represents a UNIQUE constraint
 * violation, regardless of the underlying DB engine.
 *
 * | Engine         | Error code / state                   |
 * |----------------|--------------------------------------|
 * | MySQL/MariaDB  | code ER_DUP_ENTRY  (errno 1062)      |
 * | SQLite         | code SQLITE_CONSTRAINT_UNIQUE         |
 * | PostgreSQL     | sqlState '23505'                     |
 * | ANSI SQL (generic) | sqlState starts with '23'        |
 *
 * @param  {Error} err
 * @returns {boolean}
 */
const isUniqueConstraintViolation = (err) =>
	err.code === "ER_DUP_ENTRY" ||               // MySQL / MariaDB
	err.code === "SQLITE_CONSTRAINT_UNIQUE" ||    // SQLite (Node 14+)
	err.code === "SQLITE_CONSTRAINT" ||           // SQLite (older)
	(typeof err.sqlState === "string" && err.sqlState.startsWith("23")); // ANSI SQL

/**
 * Derive a display name from LDAP attributes.
 * Preference order: displayName → cn → givenName+sn → username.
 *
 * @param  {Object} ldapUser  normalised LDAP user (from internalLdap.normalizeUser)
 * @returns {string}
 */
const deriveName = (ldapUser) => {
	if (ldapUser.displayName) {
		return ldapUser.displayName;
	}
	const parts = [ldapUser.givenName, ldapUser.surname].filter(Boolean);
	if (parts.length) {
		return parts.join(" ");
	}
	return ldapUser.username || "LDAP User";
};


/**
 * Generate a synthetic email address for LDAP users who have no real email.
 *
 * The generated address uses the stable LDAP GUID as the local-part so it is
 * unique per directory object and never collides with any real email address.
 * The domain `ldap.local` is RFC 2606 reserved — it will never be a live domain.
 *
 * When `username` (sAMAccountName or uid) is supplied the address is formatted as
 * `<username>-<shortguid>@ldap.local` so that multiple no-email users with the same
 * Display Name are still distinguishable in the NPM UI.
 *
 * @param  {string}      ldapGuid  objectGUID (hex) or entryUUID (hyphenated UUID)
 * @param  {string|null} [username] sAMAccountName / uid (optional)
 * @returns {string}  e.g. "aoutler-fdfdfdfd@ldap.local" or "fdfdfdfd-13fd-4959-fd1f-fd7cfdfdfd3f@ldap.local"
 */
const makeMockEmail = (ldapGuid, username) => {
	// Strip hyphens for a compact 8-char prefix that still fits comfortably in UI columns
	const shortGuid = ldapGuid.replace(/-/g, "").slice(0, 8);
	return username
		? `${username}-${shortGuid}@ldap.local`
		: `${ldapGuid}@ldap.local`;
};

/**
 * Parse a group identifier string into an array of individual group identifiers.
 *
 * Supports three formats:
 *   1. Single DN or CN string
 *   2. Newline-separated list:  "cn=admins,...\ncn=super-admins,..."
 *   3. Comma-separated DNs joined end-to-end:
 *      "cn=admins,ou=Groups,dc=example,dc=com,cn=super-admins,ou=Groups,dc=example,dc=com"
 *      (Split on commas that are immediately followed by cn= or uid=)
 *
 * @param  {string} groupIdentifier
 * @returns {string[]}
 */
const parseGroupIdentifiers = (groupIdentifier) => {
	if (!groupIdentifier) {
		return [];
	}

	const trimmed = groupIdentifier.trim();

	// Format 2 — newline-separated
	if (trimmed.includes("\n")) {
		return trimmed
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean);
	}

	// Format 3 — detect multiple DNs joined by commas
	// Split on commas that are immediately followed by a new RDN starting with cn= or uid=
	if (/,\s*(cn|uid)=/i.test(trimmed)) {
		const parts = trimmed.split(/,(?=\s*(cn|uid)=)/i).map((s) => s.trim()).filter(Boolean);
		if (parts.length > 1) {
			return parts;
		}
	}

	// Format 1 — single identifier
	return [trimmed];
};

/**
 * Check whether a group DN list contains a specific group.
 * Matches by exact DN or by CN prefix (cn=<value>,…).
 *
 * @param  {string[]} groupDNs        — list of group DNs the user belongs to
 * @param  {string}   groupIdentifier — group DN or CN to look for
 * @returns {boolean}
 */
const isInGroup = (groupDNs, groupIdentifier) => {
	if (!groupIdentifier || !groupDNs || !groupDNs.length) {
		return false;
	}
	const id = groupIdentifier.toLowerCase();
	return groupDNs.some((dn) => {
		const lower = dn.toLowerCase();
		return lower === id || lower.startsWith(`cn=${id},`);
	});
};

/**
 * Check whether a group DN list contains a member of any of the parsed group identifiers.
 *
 * @param  {string[]} groupDNs        — list of group DNs the user belongs to
 * @param  {string}   groupIdentifier — single or multi-group identifier string
 * @returns {boolean}
 */
const isInAnyGroup = (groupDNs, groupIdentifier) => {
	const identifiers = parseGroupIdentifiers(groupIdentifier);
	if (!identifiers.length) {
		return false;
	}
	return identifiers.some((id) => isInGroup(groupDNs, id));
};

/**
 * Write a direct audit log entry for LDAP system events (no access object required).
 *
 * @param  {number} userId    — NPM user affected
 * @param  {string} action    — audit action string
 * @param  {Object} [meta]    — additional metadata
 * @returns {Promise<void>}
 */
const writeAuditLog = async (userId, action, meta = {}) => {
	try {
		await auditLogModel.query().insert({
			user_id:     userId,
			action:      action,
			object_type: "user",
			object_id:   userId,
			meta:        { ...meta, source: "ldap-sync" },
		});
	} catch (err) {
		// Audit log failures should not break the auth flow
		logger.warn(`[ldap-sync] Failed to write audit log for user ${userId}: ${err.message}`);
	}
};

/**
 * Map a DB config row (snake_case) to the camelCase config expected by internalLdap.
 *
 * @param  {Object} row
 * @returns {Object}
 */
const rowToConfig = (row) => ({
	serverUrl:     row.server_url,
	bindDN:        row.bind_dn,
	bindPassword:  row.bind_password,
	searchBase:    row.search_base,
	userFilter:    row.user_filter,
	groupDN:       row.group_dn,
	userAttribute: row.user_attribute || "uid",
	adminGroup:    row.admin_group,
	userGroup:     row.user_group,
	enabled:       row.enabled,
	tlsVerify:     row.tls_verify,
	starttls:      row.starttls,
	// page_size=0 means "use the built-in default (500)"; any positive value is used directly
	pageSize:      row.page_size || 0,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const ldapSync = {
	/**
	 * Apply an attribute update for an existing LDAP-sourced user.
	 *
	 * Optimisation: skips the DB write entirely when name, nickname, and avatar
	 * are all unchanged, avoiding unnecessary I/O on every login.  Re-enables
	 * the account (is_disabled → 0) whenever needed, regardless of whether
	 * other attributes changed.
	 *
	 * Used by both the normal update path and the unique-constraint retry path
	 * in provisionUser.
	 *
	 * @param  {Object} user     Existing NPM user row (from DB)
	 * @param  {Object} attrs    New attribute values: { name, nickname, email }
	 * @returns {Promise<Object>} Refreshed NPM user row
	 */
	_updateExistingLdapUser: async (user, { name, nickname, email }) => {
		logger.debug(`[ldap-sync] Updating existing LDAP user "${email}" (id=${user.id})`);

		const newAvatar = gravatar.url(email, { default: "mm" });

		// Compare computed attributes with what is currently stored in the DB.
		const attrsChanged =
			user.name     !== name     ||
			user.nickname !== nickname ||
			user.avatar   !== newAvatar;

		const patchData = {};

		if (attrsChanged) {
			patchData.name     = name;
			patchData.nickname = nickname;
			patchData.avatar   = newAvatar;
		}

		// Re-enable if the account was previously disabled (user passed group
		// checks earlier in provisionUser, so access is now permitted).
		const wasDisabled = Boolean(user.is_disabled);
		if (wasDisabled) {
			patchData.is_disabled = 0;
		}

		if (Object.keys(patchData).length > 0) {
			patchData.modified_on = now();
			await userModel.query().patch(patchData).where("id", user.id);
		} else {
			logger.debug(`[ldap-sync] Skipping patch for user "${email}" (id=${user.id}) — no attribute changes`);
		}

		if (wasDisabled) {
			logger.info(`[ldap-sync] Re-enabling user "${email}" (id=${user.id}) — now in allowed group`);
			await writeAuditLog(user.id, "ldap_user_reenabled", { email, reason: "User rejoined allowed group" });
		}

		// Return a fresh row so callers have up-to-date data.
		return userModel.query().findById(user.id);
	},

	/**
	 * JIT provision or update an NPM user account from a successful LDAP authentication.
	 *
	 * Flow:
	 *  1. Extract stable LDAP GUID from ldapUser (objectGUID / entryUUID).
	 *  2. Look for an existing NPM auth record with that GUID (primary lookup).
	 *  3a. Found by GUID → update user attributes.
	 *  3b. Not found by GUID, but found by email (migration path for pre-GUID rows) →
	 *      bind GUID to that user if it is LDAP-sourced; otherwise reject (collision).
	 *  4. Not found at all → create new user + auth record.
	 *     If the user has no real email, generate a synthetic one: {guid}@ldap.local
	 *  5. Determine admin vs regular user from group membership.
	 *  6. Sync permissions.
	 *  7. Return the NPM user row.
	 *
	 * @param  {Object} ldapUser   Normalised LDAP user from internalLdap.normalizeUser()
	 *                             Expected shape: { dn, ldapGuid, username, email,
	 *                                              displayName, givenName, surname, memberOf }
	 * @param  {Object} config     LdapConfig row from the database (snake_case keys)
	 * @param  {string[]} [ldapGroups] Optional array of group DNs the user belongs to.
	 *                             When omitted, memberOf from ldapUser is used.
	 * @returns {Promise<Object>}  NPM user row
	 */
	provisionUser: async (ldapUser, config, ldapGroups) => {
		const ldapGuid = ldapUser.ldapGuid || null;
		const realEmail = (ldapUser.email || "").toLowerCase().trim();

		// If no stable GUID is available (unusual — old server, no schema extension) fall back
		// to email.  This case should be rare and the operator should be warned.
		if (!ldapGuid) {
			logger.warn(
				`[ldap-sync] LDAP user "${ldapUser.dn}" has no objectGUID or entryUUID. ` +
				`Falling back to email-based lookup. Upgrade directory or add schema support for entryUUID.`
			);
			if (!realEmail) {
				throw new Error(`LDAP user "${ldapUser.dn}" has neither a stable GUID nor an email — cannot provision NPM account`);
			}
			// Legacy path: email-based provisioning (pre-GUID behaviour)
			return ldapSync._provisionByEmail(ldapUser, config, ldapGroups);
		}

		const name     = deriveName(ldapUser);
		const nickname = ldapUser.username || (realEmail ? realEmail.split("@")[0] : ldapGuid.slice(0, 8));
		const groups   = ldapGroups || ldapUser.memberOf || [];

		// Determine role from group membership (supports multiple group DNs)
		const isAdmin = config.admin_group
			? isInAnyGroup(groups, config.admin_group)
			: false;

		// Check whether access is restricted to a specific user group (supports multiple)
		if (config.user_group && !isAdmin) {
			if (!isInAnyGroup(groups, config.user_group)) {
				const label = realEmail || ldapGuid;
				logger.warn(`[ldap-sync] User "${label}" is not a member of any required user group — access denied`);
				throw new Error("User is not a member of the required LDAP group");
			}
		}

		// ── Step 1: Primary lookup by GUID (via auth table) ──────────────────────
		const existingAuth = await authModel
			.query()
			.where("type", "ldap")
			.where("ldap_guid", ldapGuid)
			.first();

		if (existingAuth) {
			// Found by GUID — this is the normal update path.
			const existingUser = await userModel.query().findById(existingAuth.user_id);
			if (!existingUser || existingUser.is_deleted) {
				throw new Error(`[ldap-sync] Auth record for GUID "${ldapGuid}" points to missing/deleted user id=${existingAuth.user_id}`);
			}

			// The stored email may be a synthetic one; prefer real email if now available.
			const storedEmail = existingUser.email || "";
			const isSynthetic = storedEmail.endsWith("@ldap.local");
			const effectiveEmail = (!isSynthetic && storedEmail)
				? storedEmail
				: (realEmail || storedEmail);

			// Update ldap_dn in case the DN changed (AD renames, OU moves)
			if (existingAuth.ldap_dn !== ldapUser.dn) {
				await authModel.query().patch({ ldap_dn: ldapUser.dn }).where("id", existingAuth.id);
			}

			// If a real email became available and the stored one is synthetic, update it.
			if (realEmail && isSynthetic) {
				logger.info(`[ldap-sync] Replacing synthetic email for user id=${existingUser.id} with real email "${realEmail}"`);
				// Check the real email is not already claimed by another active user
				const claimant = await userModel
					.query()
					.where("email", realEmail)
					.where("is_deleted", 0)
					.whereNot("id", existingUser.id)
					.first();
				if (!claimant) {
					await userModel.query().patch({ email: realEmail, modified_on: now() }).where("id", existingUser.id);
				} else {
					logger.warn(`[ldap-sync] Cannot replace synthetic email: "${realEmail}" already claimed by user id=${claimant.id}`);
				}
			}

			const updatedUser = await ldapSync._updateExistingLdapUser(existingUser, {
				name,
				nickname,
				email: effectiveEmail,
			});
			await ldapSync.syncUserGroups(updatedUser.id, groups, config);
			return updatedUser;
		}

		// ── Step 2: Migration path — look up by email for pre-GUID rows ──────────
		if (realEmail) {
			const emailUser = await userModel
				.query()
				.where("email", realEmail)
				.where("is_deleted", 0)
				.first();

			if (emailUser) {
				if (emailUser.auth_source !== "ldap") {
					// A local (or other) account owns this email — GUID-based isolation means
					// this LDAP user can no longer share this email.  Provision with a synthetic email.
					logger.warn(
						`[ldap-sync] GUID lookup missed; email "${realEmail}" belongs to a ${emailUser.auth_source} account (id=${emailUser.id}). ` +
						`Provisioning LDAP user with synthetic email to avoid collision.`
					);
					return ldapSync._provisionNewLdapUser(ldapUser, ldapGuid, makeMockEmail(ldapGuid, ldapUser.username), name, nickname, isAdmin, groups, config);
				}

				// LDAP-sourced user found by email — backfill the GUID.
				logger.info(`[ldap-sync] Backfilling ldap_guid for existing LDAP user "${realEmail}" (id=${emailUser.id})`);
				const authRecord = await authModel
					.query()
					.where("user_id", emailUser.id)
					.where("type", "ldap")
					.first();

				if (authRecord) {
					await authModel.query().patch({
						ldap_guid: ldapGuid,
						ldap_dn:   ldapUser.dn,
					}).where("id", authRecord.id);
				}

				const updatedUser = await ldapSync._updateExistingLdapUser(emailUser, { name, nickname, email: realEmail });
				await ldapSync.syncUserGroups(updatedUser.id, groups, config);
				return updatedUser;
			}
		}

		// ── Step 3: New user — provision from scratch ─────────────────────────────
		const emailToUse = realEmail || makeMockEmail(ldapGuid, ldapUser.username);
		return ldapSync._provisionNewLdapUser(ldapUser, ldapGuid, emailToUse, name, nickname, isAdmin, groups, config);
	},

	/**
	 * Create a brand-new NPM user row + auth record for an LDAP identity.
	 * Internal helper used by provisionUser and _provisionByEmail.
	 *
	 * @param  {Object}   ldapUser
	 * @param  {string|null} ldapGuid
	 * @param  {string}   email        Effective email (real or synthetic)
	 * @param  {string}   name
	 * @param  {string}   nickname
	 * @param  {boolean}  isAdmin
	 * @param  {string[]} groups
	 * @param  {Object}   config       LdapConfig DB row
	 * @returns {Promise<Object>}      NPM user row
	 */
	_provisionNewLdapUser: async (ldapUser, ldapGuid, email, name, nickname, isAdmin, groups, config) => {
		logger.info(`[ldap-sync] Provisioning new NPM user for LDAP identity (email="${email}", guid="${ldapGuid}")`);

		let user;
		try {
			user = await userModel.query().insertAndFetch({
				name,
				nickname,
				email,
				avatar:      gravatar.url(email, { default: "mm" }),
				roles:       isAdmin ? ["admin"] : [],
				is_disabled: 0,
				is_deleted:  0,
				auth_source: "ldap",
				created_on:  now(),
				modified_on: now(),
			});
		} catch (insertErr) {
			if (!isUniqueConstraintViolation(insertErr)) {
				throw insertErr;
			}
			// Race: another concurrent request created this user between our lookup and insert.
			logger.warn(`[ldap-sync] Unique constraint race for "${email}" — retrying as update`);

			const raceUser = await userModel
				.query()
				.where("email", email)
				.where("is_deleted", 0)
				.first();

			if (!raceUser) {
				throw insertErr;
			}
			if (raceUser.auth_source !== "ldap") {
				logger.warn(`[ldap-sync] SECURITY: race-fetched user "${email}" has auth_source='${raceUser.auth_source}' — cross-source binding refused`);
				throw new Error(`Email address "${email}" is already registered with a different authentication source. LDAP login refused.`);
			}

			// Backfill GUID on the race-winner's auth record if missing
			const raceAuth = await authModel.query().where("user_id", raceUser.id).where("type", "ldap").first();
			if (raceAuth && !raceAuth.ldap_guid && ldapGuid) {
				await authModel.query().patch({ ldap_guid: ldapGuid, ldap_dn: ldapUser.dn }).where("id", raceAuth.id);
			}

			const updatedUser = await ldapSync._updateExistingLdapUser(raceUser, { name, nickname, email });
			await ldapSync.syncUserGroups(updatedUser.id, groups, config);
			return updatedUser;
		}

		// Wrap auth + permissions inserts in a transaction to prevent zombie users
		// (user row without auth record) if either insert fails on strict SQL engines.
		// Note: secret must be '' not null — MySQL/PostgreSQL enforce NOT NULL on auth.secret.
		await db().transaction(async (trx) => {
			await authModel.query(trx).insert({
				user_id:   user.id,
				type:      "ldap",
				secret:    "",
				ldap_dn:   ldapUser.dn,
				ldap_guid: ldapGuid,
				meta:      {},
			});

			await userPermissionModel.query(trx).insert({
				user_id:           user.id,
				visibility:        isAdmin ? "all" : "user",
				proxy_hosts:       "manage",
				redirection_hosts: "manage",
				dead_hosts:        "manage",
				streams:           "manage",
				access_lists:      "manage",
				certificates:      "manage",
			});
		});

		await writeAuditLog(user.id, "ldap_user_provisioned", { email, ldapGuid, isAdmin });
		logger.info(`[ldap-sync] Created NPM user id=${user.id} for "${email}" (admin=${isAdmin}, guid=${ldapGuid})`);

		await ldapSync.syncUserGroups(user.id, groups, config);
		return user;
	},

	/**
	 * Legacy email-based provisioning fallback.
	 * Used when the LDAP entry has no objectGUID or entryUUID (unusual configuration).
	 *
	 * @param  {Object}   ldapUser
	 * @param  {Object}   config
	 * @param  {string[]} ldapGroups
	 * @returns {Promise<Object>}
	 */
	_provisionByEmail: async (ldapUser, config, ldapGroups) => {
		const email = (ldapUser.email || "").toLowerCase().trim();

		if (!email) {
			throw new Error("LDAP user has no email address and no stable GUID — cannot provision NPM account");
		}

		const name     = deriveName(ldapUser);
		const nickname = ldapUser.username || email.split("@")[0];
		const groups   = ldapGroups || ldapUser.memberOf || [];

		const isAdmin = config.admin_group
			? isInAnyGroup(groups, config.admin_group)
			: false;

		if (config.user_group && !isAdmin) {
			if (!isInAnyGroup(groups, config.user_group)) {
				logger.warn(`[ldap-sync] User "${email}" is not a member of any required user group — access denied`);
				throw new Error("User is not a member of the required LDAP group");
			}
		}

		let user = await userModel
			.query()
			.where("email", email)
			.where("is_deleted", 0)
			.first();

		if (user) {
			if (user.auth_source === "ldap") {
				user = await ldapSync._updateExistingLdapUser(user, { name, nickname, email });
			} else {
				logger.warn(`[ldap-sync] SECURITY: LDAP user "${email}" matches an existing account with auth_source='${user.auth_source}' (id=${user.id}). Cross-source binding refused.`);
				throw new Error(`Email address "${email}" is already registered with a different authentication source. LDAP login refused.`);
			}
		} else {
			user = await ldapSync._provisionNewLdapUser(ldapUser, null, email, name, nickname, isAdmin, groups, config);
			// syncUserGroups already called inside _provisionNewLdapUser — do not call again here
			return user;
		}

		await ldapSync.syncUserGroups(user.id, groups, config);
		return user;
	},

	/**
	 * Disable an NPM user account.
	 * Called when a user is removed from the required LDAP access group.
	 *
	 * @param  {number} userId  NPM user id
	 * @param  {string} [reason]  Human-readable reason for the audit log
	 * @returns {Promise<void>}
	 */
	disableUser: async (userId, reason) => {
		logger.info(`[ldap-sync] Disabling NPM user id=${userId} (removed from LDAP group)`);

		await userModel.query().patch({
			is_disabled: 1,
			modified_on: now(),
		}).where('id', userId);

		await writeAuditLog(userId, "ldap_user_disabled", { reason: reason || "Removed from required LDAP group" });
	},

	/**
	 * Synchronise NPM permissions for a user based on their current LDAP group memberships.
	 *
	 * Rules:
	 *  - Member of config.admin_group → visibility='all', roles=['admin']
	 *  - Member of config.user_group (but not admin) → visibility='user', roles=[]
	 *  - Member of neither allowed group → disable user account
	 *
	 * Supports multiple group DNs in admin_group and user_group (newline or cn= boundary).
	 * Detects permission changes and writes audit log entries.
	 *
	 * @param  {number}   userId      NPM user id
	 * @param  {string[]} ldapGroups  Array of group DNs the user currently belongs to
	 * @param  {Object}   config      LdapConfig row
	 * @returns {Promise<void>}
	 */
	syncUserGroups: async (userId, ldapGroups, config) => {
		const isAdmin = config.admin_group
			? isInAnyGroup(ldapGroups, config.admin_group)
			: false;

		// Check if user has ANY allowed access
		let hasAccess = isAdmin;
		if (!hasAccess && config.user_group) {
			hasAccess = isInAnyGroup(ldapGroups, config.user_group);
		} else if (!hasAccess && !config.user_group) {
			// No user_group restriction → everyone with a valid LDAP account has access
			hasAccess = true;
		}

		const visibility = isAdmin ? "all" : "user";
		const roles      = isAdmin ? ["admin"] : [];

		logger.debug(`[ldap-sync] syncUserGroups: userId=${userId} isAdmin=${isAdmin} hasAccess=${hasAccess}`);

		// Load current user state to detect changes
		const currentUser = await userModel.query().findById(userId);
		if (!currentUser) {
			logger.warn(`[ldap-sync] syncUserGroups: user id=${userId} not found, skipping`);
			return;
		}

		// If user has no access to any group → disable their account
		if (!hasAccess) {
			if (!currentUser.is_disabled) {
				logger.info(`[ldap-sync] User id=${userId} removed from all allowed groups — disabling account`);
				await ldapSync.disableUser(userId, "Removed from all allowed LDAP groups");
			}
			return; // Don't update permissions for a disabled account
		}

		// Re-enable if previously disabled (shouldn't normally reach here since
		// provisionUser handles re-enable before calling us, but be safe)
		if (currentUser.is_disabled) {
			logger.info(`[ldap-sync] Re-enabling user id=${userId} — now in allowed group`);
			await userModel.query().patch({ is_disabled: 0, modified_on: now() }).where('id', userId);
			await writeAuditLog(userId, "ldap_user_reenabled", { reason: "User rejoined allowed group" });
		}

		// Detect role changes
		const currentRoles  = currentUser.roles || [];
		const wasAdmin      = currentRoles.includes("admin");
		const roleChanged   = wasAdmin !== isAdmin;

		if (roleChanged) {
			const direction = isAdmin ? "promoted to admin" : "demoted to regular user";
			logger.info(`[ldap-sync] User id=${userId} ${direction} based on LDAP group membership`);
			await writeAuditLog(userId, "ldap_user_role_changed", {
				previousRole: wasAdmin ? "admin" : "user",
				newRole:      isAdmin ? "admin" : "user",
				reason:       `LDAP group membership changed — ${direction}`,
			});
		}

		// Update the user's roles array
		await userModel.query().patch({
			roles:       roles,
			modified_on: now(),
		}).where('id', userId);

		// Update the permissions row
		const existing = await userPermissionModel
			.query()
			.where("user_id", userId)
			.first();

		if (existing) {
			await userPermissionModel
				.query()
				.patch({ visibility }).where('id', existing.id);
		} else {
			// Permissions row missing — create it
			await userPermissionModel.query().insert({
				user_id:           userId,
				visibility:        visibility,
				proxy_hosts:       "manage",
				redirection_hosts: "manage",
				dead_hosts:        "manage",
				streams:           "manage",
				access_lists:      "manage",
				certificates:      "manage",
			});
		}
	},

	/**
	 * Force re-synchronise ALL users against the live LDAP directory.
	 *
	 * Uses RFC 2696 Paged Results Control so that only `pageSize` LDAP entries
	 * are held in memory at any one time — safe for directories with 10k–100k
	 * users.  Each page is flushed to the database before the next page is
	 * requested, keeping heap usage proportional to `pageSize` rather than the
	 * total directory size.
	 *
	 * Algorithm
	 * ─────────
	 *  1. Obtain LDAP config; bail out early if LDAP is disabled.
	 *  2. Perform a paged LDAP search for all user entries.
	 *  3. For each page:
	 *       a. Normalise each LDAP entry.
	 *       b. Record the GUID/email in seenGuids / seenEmails Sets.
	 *       c. Provision or update the NPM user account (JIT provisioning).
	 *          If the user is in LDAP but not in the required group, disable them
	 *          immediately (counted as `disabled`, not `errors`) — single decision
	 *          point for the enable/disable outcome.
	 *  4. After all pages are processed, query the local DB for LDAP-sourced
	 *     users whose GUID/email was NOT seen in the directory scan and disable them
	 *     (they have been removed from the LDAP directory).
	 *     Users already actioned in step 3 are in the seen sets and are skipped here,
	 *     preventing double-disable conflicts between the two disable paths.
	 *
	 * @param  {Object}  [options]
	 * @param  {number}  [options.pageSize]  Override the configured page size.
	 *                                       Defaults to config.pageSize or 500.
	 * @returns {Promise<{ synced: number, provisioned: number, disabled: number, errors: number, details: Array }>}
	 *   - `disabled`: users removed from the LDAP directory OR present but not in a required group.
	 *   - `errors`: genuine failures (DB errors, malformed entries, etc.).
	 *   - `disabled` and `errors` are mutually exclusive — a "not in group" outcome
	 *     is counted as `disabled`, never as `errors`.
	 */
	syncAllUsers: async ({ pageSize: pageSizeOverride } = {}) => {
		logger.info("[ldap-sync] syncAllUsers: starting full LDAP directory sync (paged)");

		// ── 1. Load config ────────────────────────────────────────────────────
		const configRow = await LdapConfig.query().where("id", 1).first();
		if (!configRow || !configRow.enabled) {
			logger.info("[ldap-sync] syncAllUsers: LDAP not configured or disabled — skipping");
			return { synced: 0, provisioned: 0, disabled: 0, errors: 0, details: [] };
		}

		const config   = rowToConfig(applyEnvOverrides(configRow));
		const pageSize = pageSizeOverride || config.pageSize || 500;

		logger.info(`[ldap-sync] syncAllUsers: using pageSize=${pageSize}`);

		// ── 2 & 3. Paged LDAP scan with per-page DB batch ────────────────────
		const seenGuids  = new Set();   // tracks every ldapGuid observed in LDAP scan
		const seenEmails = new Set();   // fallback for entries without GUID
		const details    = [];
		let synced       = 0;
		let provisioned  = 0;
		let errors       = 0;
		let disabled     = 0;

		await internalLdap.searchAllUsers(
			config,
			async (page) => {
				// Process each LDAP entry in this page sequentially so that we
				// don't overwhelm the database with concurrent writes.
				for (const ldapEntry of page) {
					let entryEmail = "";
					// Hoist existingId/isNew so the catch block can read them even if
					// provisionUser throws (const inside try is not visible to catch).
					let existingId = null;
					let isNew      = true;
					try {
						const normalizedUser = internalLdap.normalizeUser(ldapEntry, config.userAttribute);
						entryEmail = normalizedUser.email.toLowerCase().trim();

						if (!entryEmail && !normalizedUser.ldapGuid) {
							// Skip entries with neither email nor GUID — cannot provision or track
							logger.debug(`[ldap-sync] syncAllUsers: skipping entry with no email and no GUID: ${ldapEntry.dn}`);
							details.push({ dn: ldapEntry.dn, status: "skipped", reason: "No email address and no GUID" });
							continue;
						}

						if (normalizedUser.ldapGuid) {
							seenGuids.add(normalizedUser.ldapGuid);
						}
						if (entryEmail) {
							seenEmails.add(entryEmail);
						}

						// Determine whether this is a new or existing user (GUID-first lookup).
						// We capture this before provisionUser so the catch block can disable
						// an existing account when the user fails the group membership check.
						const existingUser = normalizedUser.ldapGuid
							? await authModel.query().where("type", "ldap").where("ldap_guid", normalizedUser.ldapGuid).first()
								.then((ar) => ar ? userModel.query().findById(ar.user_id) : null)
							: await userModel.query().where("email", entryEmail).where("is_deleted", 0).first();

						isNew      = !existingUser;
						existingId = existingUser?.id ?? null;

						// provisionUser handles creation, update, re-enabling, and group sync
						await ldapSync.provisionUser(normalizedUser, configRow, normalizedUser.memberOf);

						if (isNew) {
							provisioned++;
							details.push({ email: entryEmail, status: "provisioned" });
						} else {
							synced++;
							details.push({ email: entryEmail, status: "synced" });
						}
					} catch (err) {
						const label = entryEmail || ldapEntry.dn || "unknown";

						// ── Unified disable/enable decision point ───────────────────────────
						// "Not in required group" is a deliberate access-control outcome, NOT
						// a processing error.  We make the disable decision here (step 3) so
						// there is a single decision point.  The user's GUID/email is already
						// in the seen sets, so step 4 will skip them — preventing any
						// double-disable conflict between the two disable paths (subtask 2).
						if (err.message === "User is not a member of the required LDAP group") {
							if (existingId) {
								const userToCheck = await userModel.query().findById(existingId);
								if (userToCheck && !userToCheck.is_disabled) {
									logger.info(`[ldap-sync] syncAllUsers: disabling "${label}" — in LDAP but not in required group`);
									await ldapSync.disableUser(existingId, "User present in LDAP but not in required group");
									disabled++;
									details.push({ email: entryEmail, status: "disabled", reason: "Not in required LDAP group" });
								} else {
									// Already disabled — no further action needed
									details.push({ email: entryEmail, status: "skipped", reason: "Not in required LDAP group (already disabled)" });
								}
							} else {
								// New user not in group — nothing to disable, just skip
								details.push({ email: entryEmail, status: "skipped", reason: "Not in required LDAP group (no existing account)" });
							}
							continue; // NOT an error — do not increment errors counter
						}

						// Genuine processing error (DB failure, LDAP malformed entry, etc.)
						errors++;
						logger.error(`[ldap-sync] syncAllUsers: error processing "${label}": ${err.message}`);
						details.push({ email: entryEmail || ldapEntry.dn, status: "error", reason: err.message });
					}
				}
			},
			pageSize,
		);

		// ── 4. Disable local LDAP users absent from the directory scan ────────
		// Only users whose GUID/email was NOT seen in step 3 are processed here.
		// Users already actioned in step 3 (seen in LDAP, group check performed)
		// are in seenGuids / seenEmails and will have isAbsent=false — ensuring the
		// two disable paths never conflict with each other.
		const localLdapUsers = await userModel
			.query()
			.where("auth_source", "ldap")
			.where("is_deleted", 0)
			.select("id", "email", "is_disabled");

		for (const user of localLdapUsers) {
			const userEmail = (user.email || "").toLowerCase().trim();

			// Prefer GUID-based absence check; fall back to email for pre-GUID rows.
			const authRecord = await authModel
				.query()
				.where("user_id", user.id)
				.where("type", "ldap")
				.first();

			const isAbsent = authRecord?.ldap_guid
				? !seenGuids.has(authRecord.ldap_guid)
				: !seenEmails.has(userEmail);

			// Skip users that were already processed in step 3 (seen in LDAP scan).
			// This is enforced by isAbsent=false for seen entries, but the comment
			// makes the design contract explicit: step 3 owns group-check disables,
			// step 4 owns directory-removal disables — they are mutually exclusive.
			if (isAbsent && !user.is_disabled) {
				logger.info(`[ldap-sync] syncAllUsers: disabling user "${userEmail}" — not found in LDAP directory`);
				await ldapSync.disableUser(user.id, "User removed from LDAP directory");
				disabled++;
				details.push({ email: user.email, status: "disabled", reason: "Removed from LDAP directory" });
			}
		}

		logger.info(
			`[ldap-sync] syncAllUsers complete: synced=${synced} provisioned=${provisioned} disabled=${disabled} errors=${errors}`,
		);

		return { synced, provisioned, disabled, errors, details };
	},

	/**
	 * Re-synchronise only the LDAP-sourced users that already exist in the local
	 * database (does not scan the full LDAP directory).
	 *
	 * This is the legacy behaviour of syncAllUsers prior to paged-results support.
	 * It is useful when you want to re-check group memberships for known users
	 * without performing a full directory enumeration (e.g. frequent scheduled runs).
	 *
	 * For each existing LDAP user in the DB:
	 *  1. Look up their DN in the auth table
	 *  2. Fetch current group memberships from the LDAP server
	 *  3. Re-run syncUserGroups (updates roles, disables if removed from all groups)
	 *
	 * @returns {Promise<{ synced: number, disabled: number, errors: number, details: Array }>}
	 */
	syncDbUsers: async () => {
		logger.info("[ldap-sync] syncDbUsers: re-syncing group memberships for known LDAP users");

		const configRow = await LdapConfig.query().where("id", 1).first();
		if (!configRow || !configRow.enabled) {
			logger.info("[ldap-sync] syncDbUsers: LDAP not configured or disabled — skipping");
			return { synced: 0, disabled: 0, errors: 0, details: [] };
		}

		const config = rowToConfig(applyEnvOverrides(configRow));

		// Load existing LDAP users from the DB in pages to avoid loading all at once.
		// Objection.js doesn't have a built-in cursor, so we use LIMIT / OFFSET.
		const DB_PAGE_SIZE = 200;
		let offset         = 0;
		const details      = [];
		let disabled       = 0;
		let errors         = 0;
		let totalUsers     = 0;

		while (true) {
			const ldapUsers = await userModel
				.query()
				.where("auth_source", "ldap")
				.where("is_deleted", 0)
				.orderBy("id")
				.limit(DB_PAGE_SIZE)
				.offset(offset);

			if (!ldapUsers.length) {
				break;
			}

			offset     += ldapUsers.length;
			totalUsers += ldapUsers.length;

			for (const user of ldapUsers) {
				try {
					const authRecord = await authModel
						.query()
						.where("user_id", user.id)
						.where("type", "ldap")
						.first();

					if (!authRecord || !authRecord.ldap_dn) {
						logger.warn(`[ldap-sync] syncDbUsers: user id=${user.id} has no LDAP auth record — skipping`);
						details.push({ userId: user.id, email: user.email, status: "skipped", reason: "No LDAP auth record" });
						continue;
					}

					const groupEntries = await internalLdap.getUserGroups(config, authRecord.ldap_dn, user.nickname);
					const groupDNs     = groupEntries.map((g) => g.dn || "").filter(Boolean);

					const wasDisabled = user.is_disabled;

					await ldapSync.syncUserGroups(user.id, groupDNs, config);

					const updatedUser = await userModel.query().findById(user.id);
					const nowDisabled = updatedUser?.is_disabled;

					if (!wasDisabled && nowDisabled) {
						disabled++;
						details.push({ userId: user.id, email: user.email, status: "disabled", reason: "Removed from all allowed groups" });
					} else {
						const updatedRoles = updatedUser?.roles || [];
						details.push({ userId: user.id, email: user.email, status: "synced", isAdmin: updatedRoles.includes("admin") });
					}
				} catch (err) {
					errors++;
					logger.error(`[ldap-sync] syncDbUsers: error syncing user id=${user.id}: ${err.message}`);
					details.push({ userId: user.id, email: user.email, status: "error", reason: err.message });
				}
			}
		}

		const synced = totalUsers - errors;
		logger.info(`[ldap-sync] syncDbUsers complete: synced=${synced} disabled=${disabled} errors=${errors}`);

		return { synced, disabled, errors, details };
	},

	/**
	 * Backfill ldap_guid for existing LDAP-sourced users who have no GUID stored yet.
	 *
	 * This is a one-time migration helper for deployments upgrading from the email-based
	 * identifier to the GUID-based identifier.  It searches the LDAP directory for each
	 * known LDAP user (using their stored ldap_dn), fetches objectGUID/entryUUID, and
	 * writes the GUID back to the auth table.
	 *
	 * Run this once after deploying the ldap_guid migration.
	 * Users who are no longer in the directory are skipped (they will be disabled on next sync).
	 *
	 * @returns {Promise<{ total: number, backfilled: number, skipped: number, errors: number, details: Array }>}
	 */
	backfillGuids: async () => {
		logger.info("[ldap-sync] backfillGuids: starting GUID backfill for existing LDAP users");

		const configRow = await LdapConfig.query().where("id", 1).first();
		if (!configRow || !configRow.enabled) {
			logger.info("[ldap-sync] backfillGuids: LDAP not configured or disabled — skipping");
			return { total: 0, backfilled: 0, skipped: 0, errors: 0, details: [] };
		}

		const config = rowToConfig(applyEnvOverrides(configRow));

		// Fetch all LDAP auth records that have a DN but no GUID yet
		const authRecords = await authModel
			.query()
			.where("type", "ldap")
			.whereNotNull("ldap_dn")
			.whereNull("ldap_guid");

		const total    = authRecords.length;
		let backfilled = 0;
		let skipped    = 0;
		let errors     = 0;
		const details  = [];

		logger.info(`[ldap-sync] backfillGuids: ${total} auth records without GUID`);

		for (const authRecord of authRecords) {
			try {
				// Fetch the user entry from LDAP by DN to get objectGUID/entryUUID
				const entries = await internalLdap.searchByDN(config, authRecord.ldap_dn);
				if (!entries || entries.length === 0) {
					logger.warn(`[ldap-sync] backfillGuids: DN "${authRecord.ldap_dn}" not found in directory — skipping`);
					skipped++;
					details.push({ ldap_dn: authRecord.ldap_dn, status: "skipped", reason: "Not found in directory" });
					continue;
				}

				const ldapEntry    = entries[0];
				const normalized   = internalLdap.normalizeUser(ldapEntry, config.userAttribute);
				const ldapGuid     = normalized.ldapGuid;

				if (!ldapGuid) {
					logger.warn(`[ldap-sync] backfillGuids: entry "${authRecord.ldap_dn}" has no objectGUID or entryUUID — skipping`);
					skipped++;
					details.push({ ldap_dn: authRecord.ldap_dn, status: "skipped", reason: "No objectGUID or entryUUID" });
					continue;
				}

				await authModel.query().patch({ ldap_guid: ldapGuid }).where("id", authRecord.id);
				backfilled++;
				details.push({ ldap_dn: authRecord.ldap_dn, ldap_guid: ldapGuid, status: "backfilled" });
				logger.debug(`[ldap-sync] backfillGuids: backfilled GUID for auth id=${authRecord.id} → ${ldapGuid}`);
			} catch (err) {
				errors++;
				logger.error(`[ldap-sync] backfillGuids: error processing auth id=${authRecord.id}: ${err.message}`);
				details.push({ ldap_dn: authRecord.ldap_dn, status: "error", reason: err.message });
			}
		}

		logger.info(
			`[ldap-sync] backfillGuids complete: total=${total} backfilled=${backfilled} skipped=${skipped} errors=${errors}`
		);
		return { total, backfilled, skipped, errors, details };
	},

	/**
	 * Re-encode existing ldap_guid values from the old raw-hex format (32 hex chars)
	 * to the correct hyphenated GUID format with proper endian byte-swapping.
	 *
	 * This is a one-time migration helper for deployments upgrading from the old
	 * raw Buffer.toString('hex') encoding.  It detects old-format GUIDs (32 hex chars,
	 * no hyphens) and re-encodes them using parseObjectGUID.
	 *
	 * @returns {Promise<{ total: number, reencoded: number, skipped: number, errors: number, details: Array }>}
	 */
	reencodeGuids: async () => {
		logger.info("[ldap-sync] reencodeGuids: re-encoding old raw-hex GUIDs to standard format");

		// Fetch all LDAP auth records that have a GUID
		const authRecords = await authModel
			.query()
			.where("type", "ldap")
			.whereNotNull("ldap_guid");

		const total    = authRecords.length;
		let reencoded  = 0;
		let skipped    = 0;
		let errors     = 0;
		const details  = [];

		for (const authRecord of authRecords) {
			try {
				const guid = authRecord.ldap_guid;

				// Already in hyphenated format (contains dashes) → skip
				if (guid.includes("-")) {
					skipped++;
					details.push({ auth_id: authRecord.id, status: "skipped", reason: "Already in standard format" });
					continue;
				}

				// Old format: 32 hex chars, no hyphens — need to re-encode
				if (/^[0-9a-f]{32}$/i.test(guid)) {
					// Convert the old raw hex back to a Buffer, then re-parse with correct endianness
					const buf = Buffer.from(guid, "hex");
					const newGuid = parseObjectGUID(buf);

					await authModel.query().patch({ ldap_guid: newGuid }).where("id", authRecord.id);
					reencoded++;
					details.push({ auth_id: authRecord.id, old_guid: guid, new_guid: newGuid, status: "reencoded" });
					logger.debug(`[ldap-sync] reencodeGuids: auth id=${authRecord.id}: ${guid} → ${newGuid}`);
				} else {
					skipped++;
					details.push({ auth_id: authRecord.id, status: "skipped", reason: "Unrecognised format" });
				}
			} catch (err) {
				errors++;
				logger.error(`[ldap-sync] reencodeGuids: error processing auth id=${authRecord.id}: ${err.message}`);
				details.push({ auth_id: authRecord.id, status: "error", reason: err.message });
			}
		}

		logger.info(
			`[ldap-sync] reencodeGuids complete: total=${total} reencoded=${reencoded} skipped=${skipped} errors=${errors}`
		);
		return { total, reencoded, skipped, errors, details };
	},
};

export default ldapSync;
