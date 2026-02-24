/**
 * Minimal stub for tarn (connection pool library, transitive dep of knex).
 */
export class Pool {
	constructor(_opts) {}
	acquire() { return { promise: Promise.resolve({}) }; }
	release() {}
	destroy() { return Promise.resolve(); }
	numUsed() { return 0; }
	numFree() { return 0; }
	numPendingAcquires() { return 0; }
	numPendingCreates() { return 0; }
}
