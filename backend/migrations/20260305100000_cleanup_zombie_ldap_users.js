import { migrate as logger } from "../logger.js";

const migrateName = "cleanup_zombie_ldap_users";

/**
 * Cleanup Migration — Remove zombie LDAP user rows without a matching auth record.
 *
 * Background:
 *   Prior to the fix for the auth.secret NOT NULL constraint, provisioning a new
 *   LDAP user on MySQL/PostgreSQL could fail mid-way:
 *     1. user row inserted successfully (auth_source = 'ldap')
 *     2. auth insert failed with NOT NULL constraint on auth.secret
 *     3. No transaction wrapping → user row persists without an auth record
 *
 *   These "zombie" users cannot log in (no auth record) but they occupy the email
 *   address, causing subsequent LDAP provisioning attempts to hit a unique
 *   constraint violation on the email column.
 *
 * Fix:
 *   Delete user rows where auth_source = 'ldap' AND no matching auth record exists.
 *   Cascaded deletes via ON DELETE CASCADE on the user_permission table handle the
 *   orphan permission rows; if cascade is not configured we delete them explicitly.
 *
 * Safety:
 *   - Only targets rows with auth_source = 'ldap' (never touches local accounts)
 *   - Idempotent: safe to run multiple times
 *   - down() is a no-op (deleted zombie rows cannot be meaningfully restored)
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up — removing zombie LDAP users without auth records...`);

	// Find zombie user IDs: ldap users with no corresponding auth row
	const zombies = await knex("user")
		.select("user.id")
		.where("user.auth_source", "ldap")
		.whereNotExists(
			knex("auth").select("auth.id").whereColumn("auth.user_id", "user.id"),
		);

	if (zombies.length === 0) {
		logger.info(`[${migrateName}] No zombie LDAP users found — nothing to clean up`);
		return;
	}

	const zombieIds = zombies.map((row) => row.id);
	logger.warn(`[${migrateName}] Found ${zombieIds.length} zombie LDAP user(s): ids=${zombieIds.join(",")}`);

	// Delete orphan user_permission rows first (in case FK cascade is not set)
	const deletedPerms = await knex("user_permission").whereIn("user_id", zombieIds).delete();
	logger.info(`[${migrateName}] Deleted ${deletedPerms} orphan user_permission row(s)`);

	// Delete the zombie user rows
	const deletedUsers = await knex("user").whereIn("id", zombieIds).delete();
	logger.info(`[${migrateName}] Deleted ${deletedUsers} zombie user row(s)`);

	logger.info(`[${migrateName}] Zombie cleanup complete`);
};

/**
 * Undo Migrate
 *
 * Zombie rows that were deleted cannot be meaningfully restored — the auth
 * records that should have accompanied them were never written. Rolling back
 * this migration is a no-op; re-provisioning affected LDAP users will recreate
 * clean user + auth records on next login.
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = async (_knex) => {
	logger.info(`[${migrateName}] Migrating Down — no-op (deleted zombie rows cannot be restored)`);
};

export { up, down };
