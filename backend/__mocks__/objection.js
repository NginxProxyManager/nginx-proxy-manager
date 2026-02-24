/**
 * Minimal stub for the objection.js ORM — used only when the real package
 * is not installed in the test environment.
 */

export class Model {
	static query() { return this; }
	static where() { return this; }
	static first() { return Promise.resolve(null); }
	static findById() { return Promise.resolve(null); }
	static insertAndFetch() { return Promise.resolve({}); }
	static patch() { return Promise.resolve(1); }
	static patchAndFetchById() { return Promise.resolve({}); }
	static insert() { return Promise.resolve({}); }
	static delete() { return Promise.resolve(1); }
	static count() { return this; }
	static andWhere() { return this; }
	static orWhere() { return this; }
	static allowGraph() { return this; }
	static withGraphFetched() { return this; }
	static groupBy() { return this; }
	static orderBy() { return this; }
	static whereIn() { return this; }
	static limit() { return this; }
	static offset() { return this; }
	static select() { return this; }
	static knex(_db) { return null; }
	static raw(sql, ...bindings) { return { sql, bindings, toKnexRaw: () => sql }; }
	static relatedQuery() { return this; }
	static for() { return this; }
	static modify() { return this; }
}

// objection helper functions used in queries
export const ref = (expr) => ({ expression: expr });
export const raw = (sql, ...bindings) => ({ sql, bindings });
export const fn = { now: () => new Date() };
