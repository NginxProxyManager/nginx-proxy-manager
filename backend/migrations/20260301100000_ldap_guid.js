import { isMysql } from "../lib/config.js";
import { migrate as logger } from "../logger.js";

const migrateName = "ldap_guid";

/**
 * Migrate — Add ldap_guid column to the auth table.
 *
 * This column stores the stable directory identifier for LDAP-sourced users:
 *   - Active Directory:  objectGUID encoded as a lowercase hex string (32 chars)
 *   - OpenLDAP / 389-ds: entryUUID as a hyphenated UUID string (36 chars)
 *
 * Using a stable GUID as the internal key prevents cross-source binding errors
 * that occur when an LDAP user shares an email address with a local account.
 * The GUID is directory-wide unique and never reused, even if email changes.
 *
 * A unique index is added on (ldap_guid) where ldap_guid IS NOT NULL so that
 * we cannot accidentally bind two NPM users to the same directory object.
 * Existing rows (local auth, pre-GUID LDAP rows) keep ldap_guid = NULL and
 * are not affected by the index.
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	const hasCol = await knex.schema.hasColumn("auth", "ldap_guid");
	if (hasCol) {
		logger.info(`[${migrateName}] ldap_guid column already exists — skipping`);
		return;
	}

	await knex.schema.alterTable("auth", (table) => {
		table.string("ldap_guid", 64).nullable();
	});

	logger.info(`[${migrateName}] auth table: ldap_guid column added`);

	// Add partial unique index so two users cannot share the same directory GUID.
	// NULL rows (local / non-LDAP auth records) are excluded.
	if (isMysql()) {
		// MySQL does not support partial indexes.
		// Use a generated column: index only non-NULL values.
		await knex.raw(
			"ALTER TABLE `auth` ADD COLUMN `ldap_guid_active` VARCHAR(64) " +
			"GENERATED ALWAYS AS (CASE WHEN `ldap_guid` IS NOT NULL THEN `ldap_guid` ELSE NULL END) VIRTUAL"
		);
		// MySQL allows multiple NULLs in a UNIQUE index, so this correctly excludes NULLs.
		await knex.raw(
			"CREATE UNIQUE INDEX `auth_ldap_guid_unique` ON `auth` (`ldap_guid_active`)"
		);
	} else {
		// SQLite and PostgreSQL support partial indexes natively.
		await knex.raw(
			'CREATE UNIQUE INDEX IF NOT EXISTS "auth_ldap_guid_unique" ON "auth"("ldap_guid") WHERE "ldap_guid" IS NOT NULL'
		);
	}

	logger.info(`[${migrateName}] auth table: unique index on ldap_guid added`);
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	if (isMysql()) {
		try { await knex.raw("DROP INDEX `auth_ldap_guid_unique` ON `auth`"); } catch { /* may not exist */ }
		try { await knex.raw("ALTER TABLE `auth` DROP COLUMN `ldap_guid_active`"); } catch { /* may not exist */ }
	} else {
		await knex.raw('DROP INDEX IF EXISTS "auth_ldap_guid_unique"');
	}

	await knex.schema.alterTable("auth", (table) => {
		table.dropColumn("ldap_guid");
	});

	logger.info(`[${migrateName}] auth table: ldap_guid column dropped`);
};

export { up, down };
