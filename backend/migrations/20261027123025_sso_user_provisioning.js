import { isMysql, isPostgres } from "../lib/config.js";
import { migrate as logger } from "../logger.js";

const migrateName = "sso_user_provisioning";

/**
 * Migrate
 * Extends the sso_client table with fields related to managing
 * user access and provisioning
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.table("sso_client", (sso_client) => {
			sso_client.tinyint("allow_internal").notNull().defaultTo(1);
			sso_client.tinyint("allow_internal_if_admin").notNull().defaultTo(0);
			sso_client.tinyint("require_group").notNull().defaultTo(0);
			sso_client.string("require_group_name", 128).notNull().defaultTo("");
			sso_client.tinyint("provision_users").notNull().defaultTo(0);
			sso_client.tinyint("require_provision_group").notNull().defaultTo(0);
			sso_client.string("require_provision_group_name", 128).notNull().defaultTo("");
			sso_client.tinyint("require_verified_email").notNull().defaultTo(0);
			sso_client.string("button_text", 64).notNull().defaultTo("");
			sso_client.json("provision_role_map").defaultTo([]);
		})
		.then(() => {
			logger.info(`[${migrateName}] sso_client Table columns added`);

			return knex.schema.createTable("sso_auth", (table) => {
				table.increments().primary();
				table.dateTime("created_on").notNull();
				table.dateTime("modified_on").notNull();
				table.integer("sso_client_id").notNull().unsigned();
				table.integer("user_id").notNull().unsigned();
				table.string("auth_type", 16).notNull();
				table.string("issuer", 512).notNull();
				table.string("subject", 512).notNull();
				table.string("audience", 512).notNull();
				table.string("claimed_email").notNull();
				table.dateTime("first_login_at").notNull();
				table.dateTime("last_login_at").notNull();
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] sso_auth Table created`);

			return knex.schema.createTable("sso_client_auth0", (table) => {
				table.increments().primary();
				table.integer("sso_client_id").notNull().unsigned();
				table.string("client_id").notNull();
				table.string("client_secret", 2048).notNull();
				table.string("domain").notNull();
				table.string("redirect_url").notNull();
				table.json("meta").notNull();
				table.index("sso_client_id");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] sso_client_auth0 Table created`);

			return knex.schema.createTable("sso_client_github", (table) => {
				table.increments().primary();
				table.integer("sso_client_id").notNull().unsigned();
				table.string("github_client_id").notNull();
				table.string("client_secret", 2048).notNull();
				table.string("redirect_url").notNull();
				table.json("meta").notNull();
				table.index("sso_client_id");
			});
		})
		.then(async () => {
			logger.info(`[${migrateName}] sso_client_github Table created`);
			// Modify enabled from boolean to int, widen client_secret
			if (isMysql()) {
        await knex.schema.raw("ALTER TABLE sso_client_openid MODIFY COLUMN client_secret VARCHAR(2048) NOT NULL");
        return knex.schema.raw("ALTER TABLE sso_client MODIFY COLUMN enabled SMALLINT NOT NULL DEFAULT 0").then(() => {
          logger.info(`[${migrateName}] sso_client Table column modified`);
          logger.info(`[${migrateName}] sso_client_openid Table column modified`);
        });
      }
      if (isPostgres()) {
        // One query at a time to avoid Postgres `DeprecationWarning: Calling client.query() when the client is already executing a query`
        await knex.schema.raw("ALTER TABLE sso_client_openid ALTER COLUMN client_secret TYPE VARCHAR(2048)");
        return knex.schema.raw("ALTER TABLE sso_client ALTER COLUMN enabled TYPE SMALLINT USING (enabled::int)").then(() => {
          logger.info(`[${migrateName}] sso_client Table column modified`);
          logger.info(`[${migrateName}] sso_client_openid Table column modified`);
        });
      }
      // Colum type change workaround for SQlite by rename, add, update, drop
      await knex.schema.raw("ALTER TABLE sso_client RENAME COLUMN enabled TO enabled_tmp");
      await knex.schema.raw("ALTER TABLE sso_client ADD COLUMN enabled TINYINT NOT NULL DEFAULT '0'");
      await knex.schema.raw("UPDATE sso_client SET enabled = '1' WHERE enabled_tmp = true");
      await knex.schema.raw("UPDATE sso_client SET enabled = '0' WHERE enabled_tmp = false");
      await knex.schema.raw("ALTER TABLE sso_client DROP COLUMN enabled_tmp");

      await knex.schema.raw("ALTER TABLE sso_client_openid RENAME COLUMN client_secret TO client_secret_tmp");
      await knex.schema.raw("ALTER TABLE sso_client_openid ADD COLUMN client_secret VARCHAR(2048)");
      await knex.schema.raw("UPDATE sso_client_openid SET client_secret = client_secret_tmp");
      return knex.schema.raw("ALTER TABLE sso_client_openid DROP COLUMN client_secret_tmp").then(() => {
        logger.info(`[${migrateName}] sso_client Table column modified`);
        logger.info(`[${migrateName}] sso_client_openid Table column modified`);
      });
    })
    .then(async () => {
      logger.info(`[${migrateName}] sso_client Table column modified`);
      logger.info(`[${migrateName}] sso_client_openid Table column modified`);

      // Update exising OpenID configurations
      await knex.schema.raw("UPDATE sso_client SET client_type = 'OpenID' WHERE client_type = 'OAuth2/OpenID'");
      await knex.schema.raw("UPDATE sso_client SET meta = '{\"role_map\": []}' WHERE true");
      return knex.schema.raw("UPDATE sso_client_openid SET redirect_url = REPLACE(redirect_url, 'sso/oauth2/', 'sso/oauth2/openid/') WHERE true")
        .then(() => {
          logger.info(`[${migrateName}] sso_client Table updated`);
          logger.info(`[${migrateName}] sso_client_openid Table updated`);
        });
    });
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.table("sso_client", (sso_client) => {
			sso_client.dropColumn("provision_role_map");
			sso_client.dropColumn("button_text");
			sso_client.dropColumn("rerquire_verified_email");
			sso_client.dropColumn("require_provision_group_name");
			sso_client.dropColumn("require_provision_group");
			sso_client.dropColumn("provision_users");
			sso_client.dropColumn("require_group_name");
			sso_client.dropColumn("require_group");
			sso_client.dropColumn("allow_internal_if_admin");
			sso_client.dropColumn("allow_internal");
		})
		.then(() => {
			logger.info(`[${migrateName}] Dropped columns from sso_client`);

			return knex.schema.dropTable("sso_client_auth0").then(() => {
				logger.info(`[${migrateName}] Dropped table sso_client_auth0`);
			});
		})
		.then(() => {
			return knex.schema.dropTable("sso_client_github").then(() => {
				logger.info(`[${migrateName}] Dropped table sso_client_github`);
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] Done`);
		});
};

export { up, down };
