// Keep disable/re-enable invalidation durable even when creation is in flight.
const up = async (knex) => {
	await knex.schema.alterTable("user", (table) => table.integer("api_token_version").notNullable().defaultTo(0));
	await knex.schema.alterTable("api_token", (table) => table.integer("owner_version").notNullable().defaultTo(0));
};
const down = async (knex) => {
	await knex.schema.alterTable("api_token", (table) => table.dropColumn("owner_version"));
	await knex.schema.alterTable("user", (table) => table.dropColumn("api_token_version"));
};
export { up, down };
