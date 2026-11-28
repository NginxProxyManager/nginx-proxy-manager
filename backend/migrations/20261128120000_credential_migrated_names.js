import { migrate as logger } from "../logger.js";

const migrateName = "credential_migrated_names";
const OLD_NAME = /^Migrated cert #(\d+)$/;

/**
 * Credentials moved off certificates were named "Migrated cert #<id>", which can't be told apart in
 * the credentials list. Rename the ones still carrying that name after the certificate's first domain.
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	const credentials = await knex("credential").select("id", "name").where("name", "like", "Migrated cert #%");

	for (const credential of credentials) {
		const match = credential.name.match(OLD_NAME);
		if (!match) {
			continue;
		}

		const cert = await knex("certificate")
			.select("domain_names")
			.where("id", Number.parseInt(match[1], 10))
			.first();
		if (!cert) {
			continue;
		}

		let domains = cert.domain_names;
		if (typeof domains === "string") {
			try {
				domains = JSON.parse(domains);
			} catch {
				domains = [];
			}
		}
		if (!Array.isArray(domains) || !domains.length) {
			continue;
		}

		const name = (domains.length > 1 ? `${domains[0]} (+${domains.length - 1})` : domains[0]).slice(0, 255);
		await knex("credential").where("id", credential.id).update({ name });
	}

	logger.info(`[${migrateName}] credential Table altered`);
};

// The old names carry nothing the new ones don't, so there is nothing to restore
const down = async () => {};

export { up, down };
