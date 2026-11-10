// Process-local protection for authenticated PAT creation, not a login limiter.
// Store only user IDs and counters; never passwords, codes or tokens.
const limited = (seconds) =>
	Object.assign(new Error("Too many API token verification attempts; try again later"), {
		status: 429,
		public: true,
		retryAfter: Math.max(1, Math.ceil(seconds)),
	});

export const createStepUpLimiter = ({
	now = Date.now,
	windowMs = 15 * 60 * 1000,
	maxFailures = 5,
	maxUsers = 10000,
} = {}) => {
	const users = new Map();
	return async (userId, verify) => {
		const timestamp = now();
		let state = users.get(userId);
		// Never expire an in-flight verification: that would release its lock.
		if (state?.inFlight) throw limited(1);
		if (state && state.expires <= timestamp) {
			users.delete(userId);
			state = undefined;
		}
		if (state?.failures >= maxFailures) throw limited((state.expires - timestamp) / 1000);
		if (!state) {
			if (users.size >= maxUsers) {
				for (const [id, entry] of users) {
					if (!entry.inFlight && entry.expires <= timestamp) users.delete(id);
				}
				// Do not evict a blocked user: eviction would allow bypass by churn.
				if (users.size >= maxUsers) throw limited(60);
			}
			state = { failures: 0, expires: 0, inFlight: false };
			users.set(userId, state);
		}
		state.inFlight = true;
		let valid = false;
		try {
			valid = (await verify()) === true;
			return valid;
		} finally {
			state.inFlight = false;
			if (valid) {
				users.delete(userId);
			} else {
				// Count failures (including thrown verification errors), release the
				// concurrency lock, and start a fresh window after an expired attempt.
				if (state.expires <= now()) {
					state.failures = 0;
					state.expires = now() + windowMs;
				}
				state.failures++;
			}
		}
	};
};
