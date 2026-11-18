import crypto from "node:crypto";
import { isCI } from "../config.js";

/**
 * In-memory fixed window rate limiter for authentication endpoints
 */

// Keys longer than this are hashed, so a client can't make the store hold arbitrarily large
// strings (keys can include request body values such as the login identity).
const MAX_KEY_LENGTH = 128;
// Entries per limiter. A flood of unique keys sweeps expired entries, then evicts the oldest,
// instead of growing the store until the periodic cleanup runs.
const MAX_STORE_SIZE = 50000;

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

// Generated at container start (prepare/45-admin-port.sh) and sent by the admin nginx as
// X-NPM-Peer-Secret alongside X-NPM-Peer-Addr. Unset (development, or a mounted production.conf)
// means the header is never trusted.
const peerSecret = Buffer.from(process.env.NPM_PEER_SECRET || "");

const hasPeerSecret = (value) => {
	if (!peerSecret.length || typeof value !== "string") {
		return false;
	}
	const given = Buffer.from(value);
	return given.length === peerSecret.length && crypto.timingSafeEqual(given, peerSecret);
};

/**
 * The address to rate limit on: the TCP peer of the admin nginx, which it passes as
 * X-NPM-Peer-Addr ($realip_remote_addr). That header is only honoured from a loopback socket
 * carrying the startup secret, so it can only have come from the admin nginx: a proxy host or
 * stream forwarding to the backend port is also a loopback peer, but can't know the secret.
 * The realip-resolved client address is deliberately not used: nginx trusts X-Real-IP from
 * private ranges, so a client on the LAN or Docker network could pick a new address, and a fresh
 * bucket, on every request. Behind another proxy (including an NPM proxy host in front of the
 * admin UI) this resolves to that proxy's address.
 *
 * @param   {Object} req
 * @returns {String}
 */
export const getClientIp = (req) => {
	const socketAddr = req.socket?.remoteAddress || "unknown";
	const isLoopback = socketAddr === "127.0.0.1" || socketAddr === "::1" || socketAddr === "::ffff:127.0.0.1";
	const trusted = isLoopback && hasPeerSecret(req.headers["x-npm-peer-secret"]);
	const peerAddr = trusted ? req.headers["x-npm-peer-addr"]?.trim() : null;
	return peerAddr || socketAddr;
};

const makeRoom = (store, now) => {
	for (const [k, r] of store.entries()) {
		if (now - r.startTime > r.windowMs) {
			store.delete(k);
		}
	}
	// Maps iterate in insertion order, so this drops the oldest windows first
	for (const k of store.keys()) {
		if (store.size < MAX_STORE_SIZE) {
			break;
		}
		store.delete(k);
	}
};

const boundedKey = (key) =>
	key.length > MAX_KEY_LENGTH ? `sha256:${crypto.createHash("sha256").update(key).digest("hex")}` : key;

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

		const key = boundedKey(String(keyGenerator(req, getClientIp(req))));

		const now = Date.now();
		let record = store.get(key);

		if (!record || now - record.startTime > windowMs) {
			record = {
				count: 0,
				startTime: now,
				windowMs,
			};
			if (!store.has(key) && store.size >= MAX_STORE_SIZE) {
				makeRoom(store, now);
			}
			store.set(key, record);
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
