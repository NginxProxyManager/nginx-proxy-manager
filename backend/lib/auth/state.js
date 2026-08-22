import crypto from "node:crypto";

/**
 * A tiny in-memory, single-use, TTL'd key/value store.
 *
 * Used for the short lived values in the redirect based login flows:
 * - OAuth `state`/PKCE verifiers
 * - SAML request ids
 * - The one time code handed to the frontend after a successful SSO login
 *
 * The backend runs as a single process so an in-memory store is enough, and it
 * deliberately does not survive a restart: every value here is valid for at
 * most a few minutes anyway.
 */
class TransientStore {
	constructor(ttlMs) {
		this.ttlMs = ttlMs;
		this.entries = new Map();
	}

	prune() {
		const now = Date.now();
		this.entries.forEach((entry, key) => {
			if (entry.expires <= now) {
				this.entries.delete(key);
			}
		});
	}

	/**
	 * @param   {Object} value
	 * @returns {String} the generated key
	 */
	put(value) {
		this.prune();
		const key = crypto.randomBytes(32).toString("base64url");
		this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
		return key;
	}

	/**
	 * Reads and removes a key. Returns null when missing or expired.
	 *
	 * @param   {String} key
	 * @returns {Object|null}
	 */
	take(key) {
		this.prune();
		if (!key) {
			return null;
		}
		const entry = this.entries.get(key);
		if (!entry) {
			return null;
		}
		this.entries.delete(key);
		return entry.expires > Date.now() ? entry.value : null;
	}
}

// Login flows in progress: the user has been redirected to the IdP and we're
// waiting for them to come back.
const loginFlows = new TransientStore(10 * 60 * 1000);

// Completed logins waiting to be exchanged for a token by the frontend.
const exchangeCodes = new TransientStore(60 * 1000);

export { TransientStore, loginFlows, exchangeCodes };
