const up = (knex) =>
	knex.schema.createTable("api_token", (table) => {
		table.increments("id").primary();
		table.string("public_id", 24).notNullable().unique();
		table.integer("owner_user_id").unsigned().notNullable().index();
		table.string("name", 100).notNullable();
		table.string("secret_hash", 64).notNullable();
		table.json("scopes").notNullable();
		table.string("visibility", 4).notNullable();
		table.string("created_on", 24).notNullable();
		table.string("expires_on", 24).notNullable().index();
		table.string("revoked_on", 24).nullable();
		table.string("last_used_on", 24).nullable();
		// Bind to the password hash version without storing another password hash.
		table.string("password_version", 64).notNullable();
	});
const down = (knex) => knex.schema.dropTable("api_token");

export { down, up };
