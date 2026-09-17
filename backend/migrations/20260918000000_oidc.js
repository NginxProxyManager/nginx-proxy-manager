export async function up(knex) {
	await knex.schema.createTable("oidc_config", (table) => {
		table.integer("id").primary();
		table.text("config").notNullable();
		table.string("revision", 64).notNullable();
	});
	await knex.schema.createTable("oidc_identity", (table) => {
		table.increments("id").primary();
		table.integer("user_id").unsigned().notNullable().unique();
		table.string("identity_key", 64).notNullable().unique();
		table.text("issuer").notNullable();
		table.text("subject").notNullable();
	});
}

export async function down(knex) {
	await knex.schema.dropTable("oidc_identity");
	await knex.schema.dropTable("oidc_config");
}
