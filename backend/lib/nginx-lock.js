/**
 * The lock every sequence that writes nginx config, tests it and reloads nginx runs under (see
 * internal/nginx.js), otherwise concurrent saves test and rename each other's files.
 *
 * It is re-entrant: code that holds the lock can call withLock() again and runs directly. The holder is
 * tracked with AsyncLocalStorage, and Node hands the store on to everything started from inside the
 * locked section, also to timers and other callbacks that run after the section has ended. So the store
 * alone does not prove that the lock is held: each section gets its own token, and only the token of the
 * section that is running right now counts. A timer created inside a section that has finished queues
 * like any other caller.
 *
 * Background work that is started from inside a locked section should still be started with
 * runOutsideLock(), so it doesn't even look like it belongs to the section.
 *
 * This module has no database imports so it can be unit tested.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const createLock = () => {
	const storage = new AsyncLocalStorage();
	let queue = Promise.resolve();
	let active = null;

	/**
	 * @param   {Function} fn
	 * @returns {Promise}
	 */
	const withLock = (fn) => {
		const held = storage.getStore();
		if (held && held === active) {
			return fn();
		}
		const run = queue.then(async () => {
			const token = {};
			active = token;
			try {
				return await storage.run(token, fn);
			} finally {
				active = null;
			}
		});
		queue = run.catch(() => {});
		return run;
	};

	/**
	 * Runs fn without the lock context, eg. to create a timer whose callback must queue for the lock.
	 *
	 * @param   {Function} fn
	 * @returns {*} what fn returns
	 */
	const runOutsideLock = (fn) => storage.exit(fn);

	/**
	 * @returns {boolean} true when the caller is inside the locked section that is running right now
	 */
	const isHeld = () => {
		const held = storage.getStore();
		return !!held && held === active;
	};

	return { withLock, runOutsideLock, isHeld };
};

export { createLock };
