import { decryptRSA, encryptRSA } from "../lib/encrypt.js";
import { migrate as logger } from "../logger.js";

const migrateName = "sso_encrypt_secrets";

/**
 * Migrate
 * Encrypt existing client_secret values
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	// encrypt OpenID secrets
	return knex
		.select()
		.from("sso_client_openid")
		.then((configs) => {
			const updates = configs.map((config) => {
				return { id: config.id, encrypted_secret: encryptRSA(config.client_secret) };
      });

			return Promise.all(
				updates.map((updated) => {
					return knex("sso_client_openid")
						.update({ client_secret: updated.encrypted_secret })
						.where("id", updated.id);
				}),
			);
		})
		.then(() => {
			// encrypt Auth0 secrets
			return knex
				.select()
				.from("sso_client_auth0")
				.then((configs) => {
					const updates = configs.map((config) => {
						return { id: config.id, encrypted_secret: encryptRSA(config.client_secret) };
					});

				return Promise.all(
					updates.map((updated) => {
						return knex("sso_client_auth0")
							.update({ client_secret: updated.encrypted_secret })
							.where("id", updated.id);
					}),
				);
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] Secrets have been encrypted`);
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

	// decrypt OpenID secrets
	return knex
		.select()
		.from("sso_client_openid")
		.then((configs) => {
			const updates = configs.map((config) => {
				return { id: config.id, decrypted_secret: decryptRSA(config.client_secret) };
			});

			return Promise.all(
				updates.map((updated) => {
					return knex("sso_client_openid")
						.update({ client_secret: updated.decrypted_secret })
						.where("id", updated.id);
				}),
			);
		})
		.then(() => {
			// decrypt Auth0 secrets
			return knex
				.select()
				.from("sso_client_auth0")
				.then((configs) => {
					const updates = configs.map((config) => {
						return { id: config.id, decrypted_secret: decryptRSA(config.client_secret) };
					});

					return Promise.all(
						updates.map((updated) => {
							return knex("sso_client_auth0")
								.update({ client_secret: updated.decrypted_secret })
								.where("id", updated.id);
						}),
					);
				});
		})
		.then(() => {
			logger.info(`[${migrateName}] Secretes have been decrypted`);
		});
};

export { up, down };
