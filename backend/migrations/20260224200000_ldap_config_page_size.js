import { migrate as logger } from "../logger.js";

const migrateName = "ldap_config_page_size";

/**
 * No-op stub migration.
 *
 * This migration was consolidated into 20260222200000_ldap_config.js
 * but must remain as a stub so that databases which already ran the
 * original version don't report a corrupt migration directory.
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Already applied via ldap_config migration (no-op)`);
	return Promise.resolve();
};

const down = (knex) => {
	logger.info(`[${migrateName}] No-op down`);
	return Promise.resolve();
};

export { up, down };
