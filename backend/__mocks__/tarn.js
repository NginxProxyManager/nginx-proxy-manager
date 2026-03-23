/**
 * Minimal stub for tarn (connection pool library, transitive dep of knex).
 */
export class Pool {
	// biome-ignore lint/complexity/noUselessConstructor: mock stub accepts opts
	constructor(_opts) {}
	acquire() { return { promise: Promise.resolve({}) }; }
	release() {}
	destroy() { return Promise.resolve(); }
	numUsed() { return 0; }
	numFree() { return 0; }
	numPendingAcquires() { return 0; }
	numPendingCreates() { return 0; }
}
