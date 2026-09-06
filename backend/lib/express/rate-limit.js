/**
 * In-memory sliding window rate limiter for authentication endpoints
 */

const ipRequests = new Map();

// Clean up old entries every 2 minutes
setInterval(() => {
	const now = Date.now();
	for (const [ip, record] of ipRequests.entries()) {
		if (now - record.startTime > record.windowMs * 2) {
			ipRequests.delete(ip);
		}
	}
}, 120000);

export default function createRateLimiter(options = {}) {
	const windowMs = options.windowMs || 60 * 1000; // 1 minute default
	const max = options.max || 5; // 5 requests default
	const message = options.message || "Too many attempts from this IP, please try again later.";

	return (req, res, next) => {
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
			return next();
		}

		record.count++;

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
