import { isMysql } from "../lib/config.js";
import { migrate as logger } from "../logger.js";

const migrateName = "user_email_unique";

/**
 * Migrate
 *
 * Adds a UNIQUE index on user.email that is compatible with soft-deletes.
 *
 * For SQLite / PostgreSQL we use a partial unique index:
 *   CREATE UNIQUE INDEX … ON "user"(email) WHERE is_deleted = 0
 * so soft-deleted rows (is_deleted = 1) are excluded from the constraint.
 *
 * For MySQL (which lacks partial indexes) we add a virtual generated column
 * `email_active` that is non-NULL only for active rows, then put the UNIQUE
 * constraint on that column. MySQL permits multiple NULLs in a unique index.
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	if (isMysql()) {
		// Drop the plain unique index from a previous version of this migration, if it exists.
		try {
			await knex.raw("DROP INDEX `user_email_unique` ON `user`");
		} catch {
			// Index may not exist — safe to ignore
		}

		// Add generated column only if it doesn't already exist (idempotent).
		const [cols] = await knex.raw(
			"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'email_active'"
		);
		if (!cols.length) {
			await knex.raw(
				"ALTER TABLE `user` ADD COLUMN `email_active` VARCHAR(255) " +
				"GENERATED ALWAYS AS (CASE WHEN `is_deleted` = 0 THEN `email` ELSE NULL END) VIRTUAL"
			);
		}

		// Add unique index only if it doesn't already exist (idempotent).
		const [idxs] = await knex.raw(
			"SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND INDEX_NAME = 'user_email_active_unique'"
		);
		if (!idxs.length) {
			await knex.raw(
				"CREATE UNIQUE INDEX `user_email_active_unique` ON `user` (`email_active`)"
			);
		}
	} else {
		// SQLite and PostgreSQL both support partial indexes.
		// Use IF NOT EXISTS for idempotency.
		await knex.raw(
			'CREATE UNIQUE INDEX IF NOT EXISTS "user_email_active_unique" ON "user"("email") WHERE "is_deleted" = 0'
		);
	}

	logger.info(`[${migrateName}] user Table: partial UNIQUE index added on email column`);
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
		try { await knex.raw("DROP INDEX `user_email_active_unique` ON `user`"); } catch { /* may not exist */ }
		try { await knex.raw("ALTER TABLE `user` DROP COLUMN `email_active`"); } catch { /* may not exist */ }
	} else {
		await knex.raw('DROP INDEX IF EXISTS "user_email_active_unique"');
	}

	logger.info(`[${migrateName}] user Table: partial UNIQUE index dropped from email column`);
};

export { up, down };
