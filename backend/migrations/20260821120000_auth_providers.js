import { migrate as logger } from "../logger.js";

const migrateName = "auth_providers";

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
		.createTable("auth_provider", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
			table.integer("is_deleted").notNull().unsigned().defaultTo(0);
			table.integer("is_enabled").notNull().unsigned().defaultTo(1);
			// Providers that are configured through environment variables are
			// synced into this table on boot and cannot be edited in the UI.
			table.integer("is_env_managed").notNull().unsigned().defaultTo(0);
			// A stable identifier, used to match env configured providers on boot
			table.string("slug", 100).notNull();
			table.string("name", 100).notNull();
			table.string("type", 30).notNull();
			table.integer("sort_order").notNull().unsigned().defaultTo(0);
			table.json("meta").notNull();
			table.unique("slug");
		})
		.then(() => {
			logger.info(`[${migrateName}] auth_provider Table created`);

			// Records which provider an external identity came from, so that
			// a user can be linked back to their upstream account.
			//
			// identifier holds the directory's immutable id where it publishes
			// one (objectGUID / entryUUID / OIDC sub / SAML NameID), otherwise
			// the DN. It stays NULL for local password rows: every engine we
			// support treats NULLs as distinct in a unique index, so the index
			// below constrains external identities without affecting them.
			return knex.schema.alterTable("auth", (table) => {
				table.integer("provider_id").notNull().unsigned().defaultTo(0);
				table.string("identifier", 255).nullable();
				table.unique(["provider_id", "identifier"], {
					indexName: "auth_provider_identifier_unique",
				});
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] auth Table altered`);

			return knex("setting").insert({
				id: "auth-local",
				name: "Local Authentication",
				description: "Whether users are able to sign in with an email address and password",
				value: "enabled",
				meta: JSON.stringify({}),
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] auth-local Setting added`);
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

	return knex("setting")
		.where({ id: "auth-local" })
		.del()
		.then(() => {
			return knex.schema.alterTable("auth", (table) => {
				table.dropUnique(["provider_id", "identifier"], "auth_provider_identifier_unique");
				table.dropColumn("provider_id");
				table.dropColumn("identifier");
			});
		})
		.then(() => {
			return knex.schema.dropTable("auth_provider");
		})
		.then(() => {
			logger.info(`[${migrateName}] auth_provider Table dropped`);
		});
};

export { up, down };
