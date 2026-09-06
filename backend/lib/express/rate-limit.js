import { isCI } from "../config.js";

/**
 * In-memory sliding window rate limiter for authentication endpoints
 */

const ipRequests = new Map();

// Clean up old entries every 2 minutes
const cleanupTimer = setInterval(() => {
	const now = Date.now();
	for (const [ip, record] of ipRequests.entries()) {
		if (now - record.startTime > record.windowMs * 2) {
			ipRequests.delete(ip);
		}
	}
}, 120000);
cleanupTimer.unref();

export default function createRateLimiter(options = {}) {
	const windowMs = options.windowMs || 60 * 1000; // 1 minute default
	const max = options.max || 10; // 10 requests default
	const message = options.message || "Too many attempts from this IP, please try again later.";
	const skipSuccessfulRequests = options.skipSuccessfulRequests !== false;

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

		const clientIp =
			req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
			req.socket?.remoteAddress ||
			req.ip ||
			"unknown";

		const now = Date.now();
		let record = ipRequests.get(clientIp);

		if (!record || now - record.startTime > windowMs) {
			record = {
				count: 1,
				startTime: now,
				windowMs,
			};
			ipRequests.set(clientIp, record);

			if (skipSuccessfulRequests) {
				res.on("finish", () => {
					if (res.statusCode < 400) {
						const cur = ipRequests.get(clientIp);
						if (cur && cur.count > 0) {
							cur.count--;
						}
					}
				});
			}

			return next();
		}

		record.count++;

		if (skipSuccessfulRequests) {
			res.on("finish", () => {
				if (res.statusCode < 400) {
					const cur = ipRequests.get(clientIp);
					if (cur && cur.count > 0) {
						cur.count--;
					}
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

