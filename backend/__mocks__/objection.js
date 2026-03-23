/**
 * Minimal stub for the objection.js ORM — used only when the real package
 * is not installed in the test environment.
 *
 * biome-ignore: `this` in static methods is intentional for query-builder chaining.
 */

// biome-ignore lint/complexity/noStaticOnlyClass: mock mirrors Objection.js Model API
export class Model {
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static query() { return this; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static where() { return this; }
	static first() { return Promise.resolve(null); }
	static findById() { return Promise.resolve(null); }
	static insertAndFetch() { return Promise.resolve({}); }
	static patch() { return Promise.resolve(1); }
	static patchAndFetchById() { return Promise.resolve({}); }
	static insert() { return Promise.resolve({}); }
	static delete() { return Promise.resolve(1); }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static count() { return this; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static andWhere() { return this; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static orWhere() { return this; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static allowGraph() { return this; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static withGraphFetched() { return this; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static groupBy() { return this; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static orderBy() { return this; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static whereIn() { return this; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static limit() { return this; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static offset() { return this; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static select() { return this; }
	static knex(_db) { return null; }
	static raw(sql, ...bindings) { return { sql, bindings, toKnexRaw: () => sql }; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static relatedQuery() { return this; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static for() { return this; }
	// biome-ignore lint/complexity/noThisInStatic: intentional for chaining
	static modify() { return this; }
}

// objection helper functions used in queries
export const ref = (expr) => ({ expression: expr });
export const raw = (sql, ...bindings) => ({ sql, bindings });
export const fn = { now: () => new Date() };
