/**
 * Access lists can protect a site with security keys (WebAuthn) and header tokens,
 * alongside the usual basic auth users. nginx can only check basic auth on its own,
 * so a list using keys or tokens is in "gate mode": nginx asks us about every request
 * with an auth_request subrequest, and any one valid credential lets it through:
 *
 * - a session cookie, set by the sign-in page after a key tap or a password
 * - a configured header token
 * - basic auth credentials for one of the list's users
 *
 * The sign-in and enrollment pages are served on the protected site itself, under
 * /.npm-auth/, so that sessions and security keys belong to that site's domain.
 *
 * Managing keys and tokens through the API lives with the rest of the access list
 * logic, in ./access-list.js.
 */

import crypto from "node:crypto";
import net from "node:net";
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { parse as parseCookies } from "cookie";
import jwt from "jsonwebtoken";
import { getDomain } from "tldts";
import { getPrivateKey } from "../lib/config.js";
import errs from "../lib/error.js";
import { debug, access as logger } from "../logger.js";
import accessListModel from "../models/access_list.js";
import accessListAuthModel from "../models/access_list_auth.js";
import accessListKeyModel from "../models/access_list_key.js";
import accessListTokenModel from "../models/access_list_token.js";
import now from "../models/now_helper.js";
import { getDomainsForAccessList } from "./access-list-hosts.js";
import internalAuditLog from "./audit-log.js";

const RP_NAME = "Nginx Proxy Manager";
const COOKIE_PREFIX = "npm_gate_";
const CACHE_TTL_MS = 30 * 1000;
const DOMAIN_CACHE_TTL_MS = 15 * 1000;
const CEREMONY_TTL_MS = 5 * 60 * 1000;
const MAX_CEREMONIES = 1000;
const INVITE_TTL_SECONDS = 24 * 60 * 60;
const TOKEN_TOUCH_INTERVAL_MS = 60 * 1000;
const WEBAUTHN_TIMEOUT_MS = 2 * 60 * 1000;
const REDIRECT_BASE = "http://npm.invalid";

// Requests to the sign-in page API, and failed passwords, per client and list
const RATE_LIMITS = {
	api: { max: 60, windowMs: 60 * 1000 },
	password: { max: 5, windowMs: 60 * 1000 },
};

// Headers a token can't use: request plumbing, or set by nginx for the check itself
const RESERVED_HEADERS = [
	"connection",
	"content-length",
	"content-type",
	"cookie",
	"host",
	"transfer-encoding",
	"upgrade",
	"x-real-ip",
];
const RESERVED_HEADER_PREFIXES = ["x-forwarded-", "x-npm-gate-"];

/**
 * Gate tokens are signed with their own secret, derived from the private key, and with
 * a different algorithm to API tokens. An API token can't be used as a session and a
 * session can't be used against the API.
 */
let gateSecret = null;
const getGateSecret = () => {
	if (!gateSecret) {
		const privateKey = getPrivateKey();
		if (!privateKey) {
			throw new errs.InternalError("Private key is not available");
		}
		gateSecret = crypto.createHmac("sha256", privateKey).update("npm-access-gate-v1").digest();
	}
	return gateSecret;
};

const signGateToken = (payload, expiresInSeconds) =>
	jwt.sign(payload, getGateSecret(), { algorithm: "HS256", expiresIn: expiresInSeconds });

const verifyGateToken = (token, typ) => {
	if (typeof token !== "string" || !token) {
		return null;
	}
	try {
		const data = jwt.verify(token, getGateSecret(), { algorithms: ["HS256"] });
		return data?.typ === typ ? data : null;
	} catch {
		return null;
	}
};

const sha256 = (value) => crypto.createHash("sha256").update(`${value}`, "utf8").digest();

// Compares digests, so the inputs don't need to be the same length
const safeEqual = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b));

const cookieName = (listId) => `${COOKIE_PREFIX}${listId}`;

const parseBasicAuth = (header) => {
	if (typeof header !== "string" || !/^basic /i.test(header)) {
		return null;
	}
	const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
	const idx = decoded.indexOf(":");
	if (idx < 0) {
		return null;
	}
	return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
};

/**
 * Security keys are registered against the site's registrable domain, so one key
 * works for every subdomain of it that uses the list.
 *
 * @param   {String} host
 * @returns {String}
 */
const getRpId = (host) => getDomain(host, { allowPrivateDomains: true }) || host;

const domainMatches = (pattern, host) => {
	const domain = `${pattern}`.toLowerCase().trim();
	if (domain === host) {
		return true;
	}
	if (domain.startsWith("*.")) {
		return host.endsWith(domain.slice(1));
	}
	return false;
};

const clientAddress = (req) => req.get("x-real-ip") || req.ip;

/**
 * Where the request came from, as told to us by nginx. The host has to be one that
 * nginx routed to this server block.
 *
 * TLS can end at a proxy in front of NPM (a tunnel, a load balancer), so the browser may
 * be on https while nginx sees http. Both schemes are accepted for the site's address:
 * browsers only do WebAuthn on secure origins, so an http origin can't be faked by a
 * page on the network.
 *
 * @param   {Object} req
 * @returns {{host: String, rpId: String, origins: String[], secure: Boolean}}
 */
const getGateContext = (req) => {
	const host = `${req.get("x-npm-gate-host") || ""}`.toLowerCase();
	const authority = `${req.get("x-npm-gate-authority") || host}`.toLowerCase();
	const authorityHost = authority.startsWith("[")
		? authority.slice(0, authority.indexOf("]") + 1)
		: authority.split(":")[0];

	if (!host || authorityHost !== host) {
		throw new errs.ValidationError("This page has to be opened through a proxy host");
	}

	const origin = `${req.get("origin") || ""}`;
	return {
		host,
		rpId: getRpId(host),
		origins: [`https://${authority}`, `http://${authority}`],
		secure: req.get("x-npm-gate-proto") === "https" || origin.startsWith("https://"),
	};
};

// Browsers never offer security keys for IP addresses. Whether the page is a secure
// context is for the browser to say.
const keysSupported = (ctx) => !net.isIP(ctx.host.replace(/^\[|\]$/g, ""));

// The gate API is only for the sign-in pages on the same site
const assertSameOrigin = (req, ctx) => {
	const origin = req.get("origin");
	if (origin && !ctx.origins.includes(origin)) {
		throw new errs.PermissionError("Cross-origin request");
	}
};

/**
 * Only accepts redirects that stay on the protected site. Resolving with the URL parser
 * catches everything a browser would treat as another origin, such as "//host" or a
 * tab or newline after the first slash.
 *
 * @param   {String} rd
 * @returns {String}
 */
const sanitizeRedirect = (rd) => {
	if (typeof rd !== "string" || !rd.startsWith("/") || rd.length > 4096) {
		return "/";
	}
	let url;
	try {
		url = new URL(rd, REDIRECT_BASE);
	} catch {
		return "/";
	}
	if (url.origin !== REDIRECT_BASE) {
		return "/";
	}
	const path = `${url.pathname}${url.search}${url.hash}`;
	// Dot segments can collapse to "//host" (e.g. "/.//host"), which a browser reads as another site
	if (path.startsWith("//") || path.startsWith("/.npm-auth/")) {
		return "/";
	}
	return path;
};

/**
 * Small in-memory rate limiter, per bucket and key
 */
const rateLimits = new Map();

const isRateLimited = (bucket, key) => {
	const entry = rateLimits.get(`${bucket}|${key}`);
	return !!entry && entry.reset > Date.now() && entry.count >= RATE_LIMITS[bucket].max;
};

const countRequest = (bucket, key) => {
	const nowMs = Date.now();
	if (rateLimits.size > 10000) {
		rateLimits.clear();
	}
	const id = `${bucket}|${key}`;
	let entry = rateLimits.get(id);
	if (!entry || entry.reset <= nowMs) {
		entry = { count: 0, reset: nowMs + RATE_LIMITS[bucket].windowMs };
		rateLimits.set(id, entry);
	}
	entry.count++;
};

const assertApiRateLimit = (req, listId) => {
	const key = `${listId}|${clientAddress(req)}`;
	if (isRateLimited("api", key)) {
		throw new errs.AuthError("Too many attempts, wait a minute and try again");
	}
	countRequest("api", key);
};

/**
 * Credentials of each list, kept for a short while as they're checked on every request.
 * Changes made through the API clear the entry straight away.
 */
const credentialCache = new Map();

const loadCredentials = async (listId) => {
	const list = await accessListModel.query().where("id", listId).andWhere("is_deleted", 0).first();
	if (!list) {
		return null;
	}

	const [users, keys, tokens] = await Promise.all([
		accessListAuthModel.query().where("access_list_id", listId),
		accessListKeyModel.query().where("access_list_id", listId),
		accessListTokenModel.query().where("access_list_id", listId),
	]);

	return {
		id: list.id,
		name: list.name,
		ownerUserId: list.owner_user_id,
		gateMode: accessListModel.isGateMode(list),
		keyAuth: list.key_auth === true,
		sessionHours: list.key_session_hours || 168,
		users: new Map(users.map((u) => [u.username, { id: u.id, password: u.password }])),
		userIds: new Set(users.map((u) => u.id)),
		keys: new Map(keys.map((k) => [k.id, k])),
		tokens: tokens.map((t) => ({
			id: t.id,
			header: t.header_name.toLowerCase(),
			hash: Buffer.from(t.token_hash, "hex"),
		})),
	};
};

const getCredentials = (listId) => {
	const hit = credentialCache.get(listId);
	if (hit && hit.expires > Date.now()) {
		return hit.promise;
	}
	const promise = loadCredentials(listId);
	credentialCache.set(listId, { promise, expires: Date.now() + CACHE_TTL_MS });
	promise.catch(() => credentialCache.delete(listId));
	return promise;
};

const requireGateList = async (listId) => {
	const creds = await getCredentials(listId);
	if (!creds?.gateMode) {
		throw new errs.ValidationError("This site isn't protected by security keys or tokens");
	}
	return creds;
};

const isSessionCredentialActive = (creds, session) => {
	if (session.method === "key") {
		return creds.keyAuth && creds.keys.has(session.cred);
	}
	if (session.method === "password") {
		// A password change re-creates the user row, ending sessions from the old password
		return creds.userIds.has(session.cred);
	}
	return false;
};

const tokenTouches = new Map();
const touchToken = (tokenId) => {
	const last = tokenTouches.get(tokenId) || 0;
	if (Date.now() - last < TOKEN_TOUCH_INTERVAL_MS) {
		return;
	}
	tokenTouches.set(tokenId, Date.now());
	accessListTokenModel
		.query()
		.where("id", tokenId)
		.patch({ last_used_on: now() })
		.catch((err) => logger.warn(`Could not update token #${tokenId} last use: ${err.message}`));
};

/**
 * A session for the route to set with res.cookie()
 *
 * @returns {{name: String, value: String, maxAge: Number, secure: Boolean}}
 */
const createSession = (creds, ctx, method, credId) => {
	const maxAgeSeconds = creds.sessionHours * 60 * 60;
	return {
		name: cookieName(creds.id),
		value: signGateToken({ typ: "session", list: creds.id, method, cred: credId, host: ctx.host }, maxAgeSeconds),
		maxAge: maxAgeSeconds * 1000,
		secure: ctx.secure,
	};
};

/**
 * Domains of the proxy hosts using each list, for checking where a sign-in page was
 * opened. Cached briefly as the sign-in page API can be called without signing in.
 */
const domainCache = new Map();

const assertHostAllowed = async (listId, host) => {
	let hit = domainCache.get(listId);
	if (!hit || hit.expires <= Date.now()) {
		hit = { domains: await getDomainsForAccessList(listId), expires: Date.now() + DOMAIN_CACHE_TTL_MS };
		domainCache.set(listId, hit);
	}
	if (!hit.domains.some((domain) => domainMatches(domain, host))) {
		throw new errs.ValidationError("This site doesn't use this access list");
	}
};

/**
 * WebAuthn challenges waiting for the browser's answer. Each can be used once.
 */
const ceremonies = new Map();

const startCeremony = (data) => {
	const nowMs = Date.now();
	for (const [id, ceremony] of ceremonies) {
		if (ceremony.expires <= nowMs) {
			ceremonies.delete(id);
		}
	}
	while (ceremonies.size >= MAX_CEREMONIES) {
		ceremonies.delete(ceremonies.keys().next().value);
	}
	const id = crypto.randomBytes(18).toString("base64url");
	ceremonies.set(id, { ...data, expires: nowMs + CEREMONY_TTL_MS });
	return id;
};

const takeCeremony = (id, kind, ctx) => {
	const ceremony = ceremonies.get(id);
	if (ceremony) {
		ceremonies.delete(id);
	}
	if (!ceremony || ceremony.kind !== kind || ceremony.expires <= Date.now() || ceremony.host !== ctx.host) {
		throw new errs.AuthError("This attempt has expired, please try again");
	}
	return ceremony;
};

const loadInvite = async (req, token, ctx) => {
	const invite = verifyGateToken(token, "enroll");
	if (!invite) {
		throw new errs.AuthError("This enrollment link is invalid or has expired");
	}
	assertApiRateLimit(req, invite.list);
	const used = await accessListKeyModel.query().where("invite_nonce", invite.nonce).first();
	if (used) {
		throw new errs.AuthError("This enrollment link has already been used");
	}
	const creds = await requireGateList(invite.list);
	if (!creds.keyAuth) {
		throw new errs.ValidationError("Security keys aren't enabled for this access list");
	}
	await assertHostAllowed(invite.list, ctx.host);
	return { invite, creds };
};

const internalAccessGate = {
	sanitizeRedirect,

	/**
	 * Drops cached credentials and domains, for one list or all of them
	 *
	 * @param {Integer} [listId]
	 */
	invalidate: (listId) => {
		if (typeof listId === "undefined") {
			credentialCache.clear();
			domainCache.clear();
		} else {
			const id = Number.parseInt(listId, 10);
			credentialCache.delete(id);
			domainCache.delete(id);
		}
	},

	/**
	 * @param   {String} name
	 * @returns {Boolean}
	 */
	isReservedHeader: (name) => {
		const header = `${name}`.toLowerCase();
		return RESERVED_HEADERS.includes(header) || RESERVED_HEADER_PREFIXES.some((p) => header.startsWith(p));
	},

	/**
	 * Tokens are stored as a digest of the full header value
	 *
	 * @param   {String} value
	 * @returns {String}
	 */
	hashToken: (value) => sha256(value).toString("hex"),

	/**
	 * A one-time link token for registering a key on a list
	 *
	 * @param   {Integer} listId
	 * @param   {String}  name    For the key
	 * @returns {{token: String, expiresOn: String}}
	 */
	createInviteToken: (listId, name) => {
		const nonce = crypto.randomBytes(16).toString("base64url");
		return {
			token: signGateToken({ typ: "enroll", list: listId, name, nonce }, INVITE_TTL_SECONDS),
			expiresOn: new Date(Date.now() + INVITE_TTL_SECONDS * 1000).toISOString(),
		};
	},

	/**
	 * Works out which headers nginx should strip before proxying, and stores that along
	 * with the token count on the list's meta, where the config templates can see it.
	 *
	 * @param   {Integer} listId
	 * @returns {Promise}
	 */
	refreshGateMeta: async (listId) => {
		const list = await accessListModel.query().where("id", listId).first();
		if (!list) {
			return;
		}

		const [userCount, tokens] = await Promise.all([
			accessListAuthModel.query().where("access_list_id", listId).resultSize(),
			accessListTokenModel.query().where("access_list_id", listId),
		]);

		const strip = new Map();
		for (const token of tokens) {
			if (!token.forward) {
				strip.set(token.header_name.toLowerCase(), token.header_name);
			}
		}
		if (!list.pass_auth && userCount > 0) {
			strip.set("authorization", "Authorization");
		}
		// The upstream needs any header that a forwarded token uses
		for (const token of tokens) {
			if (token.forward) {
				strip.delete(token.header_name.toLowerCase());
			}
		}

		const gate = { tokens: tokens.length, strip_headers: [...strip.values()].sort() };
		await accessListModel
			.query()
			.where("id", listId)
			.patch({ meta: { ...(list.meta || {}), gate } });
	},

	/**
	 * Removes the keys and tokens of a deleted list
	 *
	 * @param   {Integer} listId
	 * @returns {Promise}
	 */
	deleteCredentials: async (listId) => {
		await accessListKeyModel.query().delete().where("access_list_id", listId);
		await accessListTokenModel.query().delete().where("access_list_id", listId);
		internalAccessGate.invalidate(listId);
	},

	/**
	 * The auth_request check: does this request carry any valid credential?
	 *
	 * @param   {Integer} listId
	 * @param   {Object}  req
	 * @returns {Promise<Boolean>}
	 */
	checkRequest: async (listId, req) => {
		// Not requiring gate mode here: while a list switches modes, nginx can ask
		// with the old config for a moment, and the list's credentials are still good.
		const creds = await getCredentials(listId);
		if (!creds) {
			return false;
		}

		// 1. Session from the sign-in page
		const cookie = parseCookies(req.get("cookie") || "")[cookieName(listId)];
		if (cookie) {
			const session = verifyGateToken(cookie, "session");
			const host = `${req.get("x-npm-gate-host") || ""}`.toLowerCase();
			if (
				session &&
				session.list === listId &&
				session.host === host &&
				isSessionCredentialActive(creds, session)
			) {
				return true;
			}
		}

		// 2. Header tokens
		for (const token of creds.tokens) {
			const value = req.get(token.header);
			if (value && crypto.timingSafeEqual(sha256(value), token.hash)) {
				touchToken(token.id);
				return true;
			}
		}

		// 3. Basic auth users
		const basic = parseBasicAuth(req.get("authorization"));
		if (basic) {
			const user = creds.users.get(basic.username);
			// Compare against something even for unknown users, to keep timing similar
			const valid = safeEqual(user ? user.password : "", basic.password);
			if (user && valid) {
				return true;
			}
		}

		return false;
	},

	/**
	 * Where to send a request that failed the check: browsers loading a page go to
	 * the sign-in page, anything else gets a 401.
	 *
	 * @param   {Integer} listId
	 * @param   {Object}  req
	 * @returns {Promise<{status: Number, location?: String, basic?: Boolean}>}
	 */
	getChallenge: async (listId, req) => {
		const creds = await getCredentials(listId);
		const isPageLoad =
			(req.method === "GET" || req.method === "HEAD") &&
			(req.get("sec-fetch-mode") === "navigate" || `${req.get("accept") || ""}`.includes("text/html"));

		if (creds && isPageLoad && (creds.keyAuth || creds.users.size > 0)) {
			const rd = sanitizeRedirect(req.get("x-npm-gate-uri") || "/");
			return {
				status: 302,
				location: `/.npm-auth/login?list=${listId}&rd=${encodeURIComponent(rd)}`,
			};
		}
		return { status: 401, basic: !!creds && creds.users.size > 0 };
	},

	/**
	 * What the sign-in page can offer on this site
	 *
	 * @param   {Integer} listId
	 * @param   {Object}  req
	 * @returns {Promise<Object>}
	 */
	getMethods: async (listId, req) => {
		const ctx = getGateContext(req);
		assertSameOrigin(req, ctx);
		assertApiRateLimit(req, listId);
		const creds = await requireGateList(listId);
		await assertHostAllowed(listId, ctx.host);

		const keyCount = [...creds.keys.values()].filter((k) => k.rp_id === ctx.rpId).length;
		return {
			password: creds.users.size > 0,
			keys: creds.keyAuth,
			key_count: creds.keyAuth ? keyCount : 0,
			keys_supported: keysSupported(ctx),
			domain: ctx.rpId,
		};
	},

	/**
	 * @param   {Integer} listId
	 * @param   {Object}  req
	 * @returns {Promise<{ceremony: String, options: Object}>}
	 */
	getLoginOptions: async (listId, req) => {
		const ctx = getGateContext(req);
		assertSameOrigin(req, ctx);
		assertApiRateLimit(req, listId);
		const creds = await requireGateList(listId);
		if (!creds.keyAuth) {
			throw new errs.ValidationError("Security keys aren't enabled for this site");
		}
		await assertHostAllowed(listId, ctx.host);

		const keys = [...creds.keys.values()].filter((k) => k.rp_id === ctx.rpId);
		if (!keys.length) {
			throw new errs.ValidationError("No security keys are registered for this site yet");
		}

		const options = await generateAuthenticationOptions({
			rpID: ctx.rpId,
			allowCredentials: keys.map((k) => ({ id: k.credential_id, transports: k.transports || [] })),
			userVerification: "discouraged",
			timeout: WEBAUTHN_TIMEOUT_MS,
		});

		const ceremony = startCeremony({
			kind: "login",
			challenge: options.challenge,
			list: creds.id,
			host: ctx.host,
			rpId: ctx.rpId,
		});
		return { ceremony, options };
	},

	/**
	 * @param   {Integer} listId
	 * @param   {Object}  req
	 * @param   {Object}  data
	 * @param   {String}  data.ceremony
	 * @param   {Object}  data.response
	 * @param   {String}  [data.rd]
	 * @returns {Promise<{session: Object, redirect: String}>}
	 */
	verifyLogin: async (listId, req, data) => {
		const ctx = getGateContext(req);
		assertSameOrigin(req, ctx);
		assertApiRateLimit(req, listId);
		const ceremony = takeCeremony(data.ceremony, "login", ctx);
		if (ceremony.list !== listId) {
			throw new errs.AuthError("This attempt has expired, please try again");
		}
		const creds = await requireGateList(listId);

		const response = data.response;
		const key = await accessListKeyModel
			.query()
			.where("access_list_id", listId)
			.andWhere("credential_id", response.id)
			.first();
		if (!key || key.rp_id !== ceremony.rpId || !creds.keyAuth) {
			throw new errs.AuthError("This security key isn't registered for this site");
		}

		let verification;
		try {
			verification = await verifyAuthenticationResponse({
				response,
				expectedChallenge: ceremony.challenge,
				expectedOrigin: ctx.origins,
				expectedRPID: ceremony.rpId,
				credential: {
					id: key.credential_id,
					publicKey: new Uint8Array(Buffer.from(key.public_key, "base64url")),
					counter: key.counter,
					transports: key.transports || [],
				},
				requireUserVerification: false,
			});
		} catch (err) {
			debug(logger, `Security key sign-in failed for list #${listId}: ${err.message}`);
			throw new errs.AuthError("The security key couldn't be verified");
		}
		if (!verification.verified) {
			throw new errs.AuthError("The security key couldn't be verified");
		}

		await accessListKeyModel
			.query()
			.where("id", key.id)
			.patch({ counter: verification.authenticationInfo.newCounter, last_used_on: now() });

		return {
			session: createSession(creds, ctx, "key", key.id),
			redirect: sanitizeRedirect(data.rd),
		};
	},

	/**
	 * @param   {Integer} listId
	 * @param   {Object}  req
	 * @param   {Object}  data
	 * @param   {String}  data.username
	 * @param   {String}  data.password
	 * @param   {String}  [data.rd]
	 * @returns {Promise<{session: Object, redirect: String}>}
	 */
	loginWithPassword: async (listId, req, data) => {
		const ctx = getGateContext(req);
		assertSameOrigin(req, ctx);
		assertApiRateLimit(req, listId);
		const limitKey = `${listId}|${clientAddress(req)}`;
		if (isRateLimited("password", limitKey)) {
			throw new errs.AuthError("Too many attempts, wait a minute and try again");
		}
		const creds = await requireGateList(listId);
		await assertHostAllowed(listId, ctx.host);

		const user = creds.users.get(data.username);
		const valid = safeEqual(user ? user.password : "", data.password);
		if (!user || !valid) {
			countRequest("password", limitKey);
			throw new errs.AuthError("Invalid username or password");
		}

		return {
			session: createSession(creds, ctx, "password", user.id),
			redirect: sanitizeRedirect(data.rd),
		};
	},

	/**
	 * @param   {Integer} listId
	 * @param   {Object}  req
	 * @returns {{name: String, secure: Boolean}}
	 */
	getLogout: (listId, req) => {
		const ctx = getGateContext(req);
		return { name: cookieName(listId), secure: ctx.secure };
	},

	/**
	 * @param   {Object}  req
	 * @param   {Object}  data
	 * @param   {String}  data.token
	 * @returns {Promise<Object>}
	 */
	getEnrollmentInfo: async (req, data) => {
		const ctx = getGateContext(req);
		assertSameOrigin(req, ctx);
		const { invite, creds } = await loadInvite(req, data.token, ctx);
		return {
			list_name: creds.name,
			key_name: invite.name,
			domain: ctx.rpId,
			keys_supported: keysSupported(ctx),
		};
	},

	/**
	 * @param   {Object}  req
	 * @param   {Object}  data
	 * @param   {String}  data.token
	 * @returns {Promise<{ceremony: String, options: Object}>}
	 */
	getEnrollmentOptions: async (req, data) => {
		const ctx = getGateContext(req);
		assertSameOrigin(req, ctx);
		const { invite, creds } = await loadInvite(req, data.token, ctx);

		const existing = [...creds.keys.values()].filter((k) => k.rp_id === ctx.rpId);
		const options = await generateRegistrationOptions({
			rpName: RP_NAME,
			rpID: ctx.rpId,
			userName: invite.name,
			userDisplayName: `${invite.name} (${creds.name})`,
			attestationType: "none",
			excludeCredentials: existing.map((k) => ({ id: k.credential_id, transports: k.transports || [] })),
			authenticatorSelection: { residentKey: "discouraged", userVerification: "discouraged" },
			timeout: WEBAUTHN_TIMEOUT_MS,
		});
		// Suggest a security key first, without ruling out passkeys on phones and laptops
		options.hints = ["security-key"];

		const ceremony = startCeremony({
			kind: "enroll",
			challenge: options.challenge,
			list: creds.id,
			host: ctx.host,
			rpId: ctx.rpId,
			nonce: invite.nonce,
			name: invite.name,
		});
		return { ceremony, options };
	},

	/**
	 * @param   {Object}  req
	 * @param   {Object}  data
	 * @param   {String}  data.ceremony
	 * @param   {Object}  data.response
	 * @returns {Promise<{session: Object}>}
	 */
	verifyEnrollment: async (req, data) => {
		const ctx = getGateContext(req);
		assertSameOrigin(req, ctx);
		const ceremony = takeCeremony(data.ceremony, "enroll", ctx);
		assertApiRateLimit(req, ceremony.list);
		const creds = await requireGateList(ceremony.list);
		if (!creds.keyAuth) {
			throw new errs.ValidationError("Security keys aren't enabled for this access list");
		}

		let verification;
		try {
			verification = await verifyRegistrationResponse({
				response: data.response,
				expectedChallenge: ceremony.challenge,
				expectedOrigin: ctx.origins,
				expectedRPID: ceremony.rpId,
				requireUserVerification: false,
			});
		} catch (err) {
			debug(logger, `Security key enrollment failed for list #${ceremony.list}: ${err.message}`);
			throw new errs.AuthError("The security key couldn't be registered");
		}
		if (!verification.verified) {
			throw new errs.AuthError("The security key couldn't be registered");
		}

		const { credential } = verification.registrationInfo;
		const duplicate = await accessListKeyModel
			.query()
			.where("access_list_id", creds.id)
			.andWhere("credential_id", credential.id)
			.first();
		if (duplicate) {
			throw new errs.ValidationError("This security key is already registered on this access list");
		}

		const reported = data.response?.response?.transports;
		const transports = Array.isArray(reported)
			? reported.filter((t) => typeof t === "string").slice(0, 8)
			: credential.transports || [];

		let row;
		try {
			row = await accessListKeyModel.query().insertAndFetch({
				access_list_id: creds.id,
				name: ceremony.name,
				rp_id: ceremony.rpId,
				credential_id: credential.id,
				public_key: Buffer.from(credential.publicKey).toString("base64url"),
				counter: credential.counter,
				transports,
				invite_nonce: ceremony.nonce,
			});
		} catch (err) {
			// invite_nonce is unique: two tabs racing on the same link
			debug(logger, `Could not store security key for list #${creds.id}: ${err.message}`);
			throw new errs.AuthError("This enrollment link has already been used");
		}

		internalAccessGate.invalidate(creds.id);
		logger.info(`Security key "${row.name}" registered on access list #${creds.id} for ${row.rp_id}`);

		await internalAuditLog.add(null, {
			user_id: creds.ownerUserId,
			action: "updated",
			object_type: "access-list",
			object_id: creds.id,
			meta: { security_key: { action: "registered", id: row.id, name: row.name, domain: row.rp_id } },
		});

		return { session: createSession(creds, ctx, "key", row.id) };
	},
};

export default internalAccessGate;
