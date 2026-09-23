import { AsyncLocalStorage } from "node:async_hooks";

const queues = new Map();
const lockContext = new AsyncLocalStorage();

const withNameLock = async (name, callback) => {
	// Certificate restoration can re-enter the lifecycle lock in the same request.
	const held = lockContext.getStore();
	if (held?.get(name)?.active) return callback();
	const previous = queues.get(name) || Promise.resolve();
	let release;
	const current = new Promise((resolve) => {
		release = resolve;
	});
	queues.set(name, current);

	await previous;
	const ownership = { active: true };
	const context = new Map(held);
	context.set(name, ownership);
	try {
		return await lockContext.run(context, callback);
	} finally {
		// Detached async work must queue normally once this owner has released.
		ownership.active = false;
		release();
		if (queues.get(name) === current) {
			queues.delete(name);
		}
	}
};

export const withUpstreamNameLocks = (names, callback) => {
	const uniqueNames = [...new Set(names.filter(Boolean))].sort();
	const lockNext = (index) => {
		if (index === uniqueNames.length) {
			return callback();
		}
		return withNameLock(uniqueNames[index], () => lockNext(index + 1));
	};

	return lockNext(0);
};

// The colon keeps host IDs separate from validated upstream names.
// Lock before reading: partial updates must validate the latest saved state.
export const withProxyHostLock = (callback) => (access, data) =>
	withNameLock(`host:${data.id}`, () => callback(access, data));
