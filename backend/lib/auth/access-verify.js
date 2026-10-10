/**
 * Credential checking for access lists that accept provider accounts.
 *
 * An access list normally protects a site with a htpasswd file, which only
 * works for usernames typed into the list itself: a directory will not hand
 * over password hashes, so its users cannot be written into that file.
 *
 * Instead nginx asks us, per request, whether a set of Basic credentials is
 * acceptable. That check has to be cheap, because it sits in front of every
 * single request to a protected site — hence the cache below. Without it every
 * image on a page would cost an LDAP bind.
 */

import crypto from "node:crypto";
import { auth as logger } from "../../logger.js";
import * as ldap from "./ldap.js";

/** Decisions already made, keyed by a hash of the credentials */
const decisions = new Map();

// A positive answer is held long enough to cover a page load and its assets.
// A negative one expires quickly, so fixing somebody's group membership takes
// effect without waiting.
const ALLOW_TTL_MS = 5 * 60 * 1000;
const DENY_TTL_MS = 30 * 1000;
const MAX_ENTRIES = 5000;

/**
 * The cache key never contains the password itself, only a digest of it, so a
 * memory dump does not hand over credentials.
 *
 * @param   {Integer} listId
 * @param   {String}  username
 * @param   {String}  password
 * @returns {String}
 */
const cacheKey = (listId, username, password) =>
	crypto.createHash("sha256").update(`${listId}\0${username}\0${password}`).digest("base64");

const readCache = (key) => {
	const hit = decisions.get(key);
	if (!hit) {
		return null;
	}
	if (hit.expires <= Date.now()) {
		decisions.delete(key);
		return null;
	}
	return hit.result;
};

const writeCache = (key, result) => {
	// Cheap bound: drop everything rather than track insertion order
	if (decisions.size >= MAX_ENTRIES) {
		decisions.clear();
	}
	decisions.set(key, {
		result,
		expires: Date.now() + (result.allowed ? ALLOW_TTL_MS : DENY_TTL_MS),
	});
};

/**
 * Forgets every cached decision for a list. Called when the list changes, so
 * that removing somebody's access takes effect immediately.
 *
 * @param {Integer} [listId]  omit to clear everything
 */
const invalidate = (listId) => {
	if (typeof listId === "undefined") {
		decisions.clear();
		return;
	}
	// Keys are digests, so which list they belong to cannot be told apart.
	// Clearing the lot is correct and costs only some repeated checks.
	decisions.clear();
};

/**
 * Whether a provider user's groups satisfy the list's group restriction.
 *
 * @param   {[String]} allowedGroups
 * @param   {[String]} userGroups
 * @returns {Boolean}
 */
const groupsAllow = (allowedGroups, userGroups) => {
	if (!allowedGroups?.length) {
		return true;
	}

	// Unknown membership (null) denies here, which is the opposite of how role
	// mapping treats it. Guarding a resource should fail closed; revoking
	// somebody's admin role over a failed lookup should not.
	const held = (userGroups || []).map((g) => String(g).toLowerCase());
	return allowedGroups.some((group) => held.includes(String(group).trim().toLowerCase()));
};

/**
 * Checks credentials against the list's own entries first, then each provider
 * it accepts.
 *
 * The list's own entries are plain comparisons against values we already hold,
 * so they cost nothing; providers involve a network round trip and are only
 * consulted when the local entries do not match.
 *
 * @param   {Object}   list           access list row, with items expanded
 * @param   {[Object]} providers      the enabled providers this list accepts
 * @param   {String}   username
 * @param   {String}   password
 * @returns {Promise<Object>} { allowed, via, reason }
 */
const check = async (list, providers, username, password) => {
	// An empty password would be an unauthenticated bind at the directory, and
	// matches nothing sensible locally either
	if (!username || !password) {
		return { allowed: false, reason: "no credentials" };
	}

	for (const item of list.items || []) {
		if (item.username === username && item.password && item.password === password) {
			return { allowed: true, via: "list" };
		}
	}

	for (const provider of providers) {
		if (provider.type !== "ldap") {
			// Only LDAP can verify a password presented to us. SAML and OAuth
			// authenticate by redirecting a browser, which a subrequest cannot do.
			continue;
		}

		let identity = null;
		try {
			identity = await ldap.authenticate(provider, username, password);
		} catch (err) {
			logger.error(`Access list ${list.id}: provider "${provider.name}" failed: ${err.message}`);
			continue;
		}

		if (!identity) {
			continue;
		}

		if (!groupsAllow(list.allowed_groups, identity.groups)) {
			logger.debug(`Access list ${list.id}: ${identity.email} authenticated but is not in an allowed group`);
			return { allowed: false, reason: "not in an allowed group" };
		}

		return { allowed: true, via: provider.name, email: identity.email };
	}

	return { allowed: false, reason: "invalid credentials" };
};

/**
 * The cached form of {@link check}.
 *
 * @param   {Object}   list
 * @param   {[Object]} providers
 * @param   {String}   username
 * @param   {String}   password
 * @returns {Promise<Object>}
 */
const verify = async (list, providers, username, password) => {
	const key = cacheKey(list.id, username, password);

	const cached = readCache(key);
	if (cached) {
		return { ...cached, cached: true };
	}

	const result = await check(list, providers, username, password);
	writeCache(key, result);
	return result;
};

export { check, groupsAllow, invalidate, verify };
