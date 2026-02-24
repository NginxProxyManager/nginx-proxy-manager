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
import internalLdap from "./ldap.js";
import { applyEnvOverrides } from "../lib/ldap-env.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
	 * JIT provision or update an NPM user account from a successful LDAP authentication.
	 *
	 * Flow:
	 *  1. Look for an existing NPM user with the same email address.
	 *  2a. If found with auth_source='ldap' → update name/nickname.
	 *  2b. If not found → create new user + auth record (type='ldap', no password).
	 *  3. Determine admin vs regular user from group membership (supports multiple groups).
	 *  4. Sync permissions.
	 *  5. Return the (possibly freshly-created) NPM user row.
	 *
	 * @param  {Object} ldapUser   Normalised LDAP user from internalLdap.normalizeUser()
	 *                             Expected shape: { dn, username, email, displayName,
	 *                                              givenName, surname, memberOf }
	 * @param  {Object} config     LdapConfig row from the database (camelCase keys
	 *                             as returned by the LdapConfig model)
	 * @param  {string[]} [ldapGroups] Optional array of group DNs the user belongs to.
	 *                             When omitted, memberOf from ldapUser is used.
	 * @returns {Promise<Object>}  NPM user row
	 */
	provisionUser: async (ldapUser, config, ldapGroups) => {
		const email = (ldapUser.email || "").toLowerCase().trim();

		if (!email) {
			throw new Error("LDAP user has no email address — cannot provision NPM account");
		}

		const name     = deriveName(ldapUser);
		const nickname = ldapUser.username || email.split("@")[0];
		const groups   = ldapGroups || ldapUser.memberOf || [];

		// Determine role from group membership (supports multiple group DNs)
		const isAdmin = config.admin_group
			? isInAnyGroup(groups, config.admin_group)
			: false;

		// Check whether access is restricted to a specific user group (supports multiple)
		if (config.user_group && !isAdmin) {
			if (!isInAnyGroup(groups, config.user_group)) {
				logger.warn(`[ldap-sync] User "${email}" is not a member of any required user group — access denied`);
				throw new Error("User is not a member of the required LDAP group");
			}
		}

		// 1 — Look for an existing NPM user with this email (any auth_source).
		//     We intentionally do NOT filter by auth_source here so we can detect
		//     email collisions with local accounts and reject them explicitly.
		//     A local account with the same email must NOT be bound to an LDAP login.
		let user = await userModel
			.query()
			.where("email", email)
			.where("is_deleted", 0)
			.first();

		if (user) {
			// 2a — found: update attributes if LDAP-sourced
			if (user.auth_source === "ldap") {
				logger.debug(`[ldap-sync] Updating existing LDAP user "${email}" (id=${user.id})`);

				await userModel.query().patch({
					name:        name,
					nickname:    nickname,
					avatar:      gravatar.url(email, { default: "mm" }),
					modified_on: now(),
				}).where('id', user.id);

				// If previously disabled, re-enable since they passed group checks above
				if (user.is_disabled) {
					logger.info(`[ldap-sync] Re-enabling user "${email}" (id=${user.id}) — now in allowed group`);
					await userModel.query().patch({ is_disabled: 0, modified_on: now() }).where('id', user.id);
					await writeAuditLog(user.id, "ldap_user_reenabled", { email, reason: "User rejoined allowed group" });
				}

				// Refresh the row
				user = await userModel.query().findById(user.id);
			} else {
				// SECURITY: A non-LDAP account (e.g. auth_source='local') already owns this
				// email address.  Binding an LDAP identity to it would allow account
				// hijacking — an LDAP user could gain access to a local user's account.
				// Reject the provisioning attempt entirely.
				logger.warn(`[ldap-sync] SECURITY: LDAP user "${email}" matches an existing account with auth_source='${user.auth_source}' (id=${user.id}). Cross-source binding refused.`);
				throw new Error(`Email address "${email}" is already registered with a different authentication source. LDAP login refused.`);
			}
		} else {
			// 2b — no matching user: create one
			logger.info(`[ldap-sync] Provisioning new NPM user for LDAP identity "${email}"`);

			user = await userModel.query().insertAndFetch({
				name:        name,
				nickname:    nickname,
				email:       email,
				avatar:      gravatar.url(email, { default: "mm" }),
				roles:       isAdmin ? ["admin"] : [],
				is_disabled: 0,
				is_deleted:  0,
				auth_source: "ldap",
				created_on:  now(),
				modified_on: now(),
			});

			// Create the auth record (type='ldap', no secret)
			await authModel.query().insert({
				user_id:  user.id,
				type:     "ldap",
				secret:   null,
				ldap_dn:  ldapUser.dn,
				meta:     {},
			});

			// Create default permissions row
			await userPermissionModel.query().insert({
				user_id:           user.id,
				visibility:        isAdmin ? "all" : "user",
				proxy_hosts:       "manage",
				redirection_hosts: "manage",
				dead_hosts:        "manage",
				streams:           "manage",
				access_lists:      "manage",
				certificates:      "manage",
			});

			await writeAuditLog(user.id, "ldap_user_provisioned", { email, isAdmin });
			logger.info(`[ldap-sync] Created NPM user id=${user.id} for "${email}" (admin=${isAdmin})`);
		}

		// 3 — sync group-based permissions on every login
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
	 *       b. Record the email in a lightweight `seenEmails` Set.
	 *       c. Provision or update the NPM user account (JIT provisioning).
	 *  4. After all pages are processed, query the local DB for LDAP-sourced
	 *     users whose email was NOT seen in the directory scan and disable them
	 *     (they have been removed from the LDAP directory).
	 *
	 * @param  {Object}  [options]
	 * @param  {number}  [options.pageSize]  Override the configured page size.
	 *                                       Defaults to config.pageSize or 500.
	 * @returns {Promise<{ synced: number, provisioned: number, disabled: number, errors: number, details: Array }>}
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
		const seenEmails = new Set();   // tracks every email observed in LDAP scan
		const details    = [];
		let synced       = 0;
		let provisioned  = 0;
		let errors       = 0;

		await internalLdap.searchAllUsers(
			config,
			async (page) => {
				// Process each LDAP entry in this page sequentially so that we
				// don't overwhelm the database with concurrent writes.
				for (const ldapEntry of page) {
					let entryEmail = "";
					try {
						const normalizedUser = internalLdap.normalizeUser(ldapEntry, config.userAttribute);
						entryEmail = normalizedUser.email.toLowerCase().trim();

						if (!entryEmail) {
							// Skip entries with no email — they cannot be provisioned
							logger.debug(`[ldap-sync] syncAllUsers: skipping entry without email: ${ldapEntry.dn}`);
							details.push({ dn: ldapEntry.dn, status: "skipped", reason: "No email address" });
							continue;
						}

						seenEmails.add(entryEmail);

						// Determine whether this is a new or existing user
						const existingUser = await userModel
							.query()
							.where("email", entryEmail)
							.where("is_deleted", 0)
							.first();

						const isNew = !existingUser;

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
						errors++;
						const label = entryEmail || ldapEntry.dn || "unknown";
						logger.error(`[ldap-sync] syncAllUsers: error processing "${label}": ${err.message}`);
						details.push({ email: entryEmail || ldapEntry.dn, status: "error", reason: err.message });
					}
				}
			},
			pageSize,
		);

		// ── 4. Disable local LDAP users absent from the directory scan ────────
		// Query is lightweight: only email + id + is_disabled; not loading full rows.
		const localLdapUsers = await userModel
			.query()
			.where("auth_source", "ldap")
			.where("is_deleted", 0)
			.select("id", "email", "is_disabled");

		let disabled = 0;
		for (const user of localLdapUsers) {
			const userEmail = (user.email || "").toLowerCase().trim();
			if (!seenEmails.has(userEmail) && !user.is_disabled) {
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
};

export default ldapSync;
