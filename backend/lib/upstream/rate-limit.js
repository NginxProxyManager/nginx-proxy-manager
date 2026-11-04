/**
 * In-memory sliding window rate limiter, keyed by an arbitrary string (the user id).
 * State is per process and lost on restart, which is fine for abuse protection.
 *
 * @param   {object}  options
 * @param   {number}  options.limit       Units allowed per window
 * @param   {number}  options.windowMs    Window length in milliseconds
 * @param   {function} [options.now]      Clock, for tests
 * @returns {{consume: function(string, number=): {ok: boolean, remaining: number, retryAfter: number}, reset: function(): void, size: function(): number}}
 */
const createRateLimiter = ({ limit, windowMs, now = Date.now }) => {
	/** @type {Map<string, Array<{at: number, units: number}>>} */
	const buckets = new Map();
	let lastSweep = now();

	const prune = (entries, current) => {
		while (entries.length && entries[0].at <= current - windowMs) {
			entries.shift();
		}
	};

	const sweep = (current) => {
		if (current - lastSweep < windowMs) {
			return;
		}
		lastSweep = current;
		for (const [key, entries] of buckets) {
			prune(entries, current);
			if (!entries.length) {
				buckets.delete(key);
			}
		}
	};

	return {
		/**
		 * Consumes `units` for `key`. Nothing is consumed when the request would exceed the limit.
		 */
		consume: (key, units = 1) => {
			const current = now();
			sweep(current);
			const entries = buckets.get(key) || [];
			prune(entries, current);
			const used = entries.reduce((sum, entry) => sum + entry.units, 0);

			if (used + units > limit) {
				// Work out when enough units will have expired
				let freed = 0;
				let retryAt = current + windowMs;
				for (const entry of entries) {
					freed += entry.units;
					if (used - freed + units <= limit) {
						retryAt = entry.at + windowMs;
						break;
					}
				}
				buckets.set(key, entries);
				return {
					ok: false,
					remaining: Math.max(0, limit - used),
					retryAfter: Math.max(1, Math.ceil((retryAt - current) / 1000)),
				};
			}

			entries.push({ at: current, units });
			buckets.set(key, entries);
			return { ok: true, remaining: limit - used - units, retryAfter: 0 };
		},

		reset: () => {
			buckets.clear();
		},

		size: () => buckets.size,
	};
};

export { createRateLimiter };
