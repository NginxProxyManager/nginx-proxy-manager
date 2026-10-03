import { migrate as logger } from "../logger.js";

const migrateName = "webauthn-credentials";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.createTable("webauthn_credential", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
			table.integer("user_id").notNull().unsigned();
			table.string("credential_id", 512).notNull();
			table.text("public_key").notNull();
			table.bigInteger("counter").notNull().unsigned().defaultTo(0);
			table.json("transports").notNull();
			table.string("device_type", 30).notNull().defaultTo("singleDevice");
			table.integer("backed_up").notNull().unsigned().defaultTo(0);
			table.string("friendly_name", 255).notNull().defaultTo("");
			table.integer("is_deleted").notNull().unsigned().defaultTo(0);
			table.unique("credential_id");
			table.index("user_id");
		})
		.then(() => {
			logger.info(`[${migrateName}] webauthn_credential Table created`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema.dropTableIfExists("webauthn_credential").then(() => {
		logger.info(`[${migrateName}] webauthn_credential Table dropped`);
	});
};

export { up, down };
