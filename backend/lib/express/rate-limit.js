import { isCI } from "../config.js";

/**
 * In-memory sliding window rate limiter for authentication endpoints
 */

// One store per limiter, so separate endpoints never share buckets
const stores = new Set();

// Clean up old entries every 2 minutes
const cleanupTimer = setInterval(() => {
	const now = Date.now();
	for (const store of stores) {
		for (const [key, record] of store.entries()) {
			if (now - record.startTime > record.windowMs * 2) {
				store.delete(key);
			}
		}
	}
}, 120000);
cleanupTimer.unref();

/**
 * The client IP as seen by the backend. X-Forwarded-For is only honoured when the socket is
 * loopback, which is the admin nginx in this container; it sets the header to its own
 * $remote_addr after realip processing, so the first entry is the resolved client.
 *
 * @param   {Object} req
 * @returns {String}
 */
export const getClientIp = (req) => {
	const socketAddr = req.socket?.remoteAddress || "unknown";
	const isTrustedLocalProxy = socketAddr === "127.0.0.1" || socketAddr === "::1" || socketAddr === "::ffff:127.0.0.1";
	const forwardedFor = isTrustedLocalProxy ? req.headers["x-forwarded-for"]?.split(",")[0].trim() : null;
	return forwardedFor || socketAddr;
};

/**
 * @param {Object}   [options]
 * @param {Number}   [options.windowMs]
 * @param {Number}   [options.max]
 * @param {String}   [options.message]
 * @param {Boolean}  [options.skipSuccessfulRequests]
 * @param {Function} [options.keyGenerator]  (req, clientIp) => String. Defaults to the client IP.
 *                                           Including the target account in the key stops every
 *                                           user being locked out when many clients share an IP
 *                                           (e.g. the admin UI behind another reverse proxy).
 */
export default function createRateLimiter(options = {}) {
	const windowMs = options.windowMs || 60 * 1000; // 1 minute default
	const max = options.max || 10; // 10 requests default
	const message = options.message || "Too many attempts from this IP, please try again later.";
	const skipSuccessfulRequests = options.skipSuccessfulRequests !== false;
	const keyGenerator = options.keyGenerator || ((_req, clientIp) => clientIp);

	const store = new Map();
	stores.add(store);

	return (req, res, next) => {
		// Bypass rate limiting in CI, test environments, or when explicitly disabled
		if (
			isCI() ||
			process.env.CI === "true" ||
			process.env.NODE_ENV === "test" ||
			process.env.DISABLE_RATE_LIMIT === "true"
		) {
			return next();
		}

		const key = keyGenerator(req, getClientIp(req));

		const now = Date.now();
		let record = store.get(key);

		if (!record || now - record.startTime > windowMs) {
			record = {
				count: 1,
				startTime: now,
				windowMs,
			};
			store.set(key, record);

			if (skipSuccessfulRequests) {
				const currentRecord = record;
				res.on("finish", () => {
					if (res.statusCode < 400 && currentRecord.count > 0) {
						currentRecord.count--;
					}
				});
			}

			return next();
		}

		record.count++;

		if (skipSuccessfulRequests) {
			const currentRecord = record;
			res.on("finish", () => {
				if (res.statusCode < 400 && currentRecord.count > 0) {
					currentRecord.count--;
				}
			});
		}

		if (record.count > max) {
			res.setHeader("Retry-After", Math.ceil((record.startTime + windowMs - now) / 1000));
			return res.status(429).json({
				error: {
					code: 429,
					message,
				},
			});
		}

		next();
	};
}
