import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeAuthorization } from "../lib/auth/oauth.js";

/**
 * completeAuthorization against a fake identity provider: a token endpoint
 * that hands back whatever ID token the test signed, a JWKS holding the
 * matching public key, and optionally a userinfo endpoint.
 */
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", use: "sig" };

const CLIENT_ID = "npm-client";
const NONCE = "expected-nonce";

let idp;

const provider = () => ({
	id: 1,
	name: "Test oauth",
	type: "oauth",
	meta: {
		client_id: CLIENT_ID,
		authorization_url: "https://idp.test/authorize",
		token_url: "https://idp.test/token",
		jwks_url: "https://idp.test/jwks",
		userinfo_url: idp.userinfo ? "https://idp.test/userinfo" : "",
	},
});

const flow = { nonce: NONCE, codeVerifier: "verifier", redirectUri: "https://npm.test/callback" };

const sign = (claims, options = {}) =>
	jwt.sign({ sub: "user-1", email: "alice@example.com", aud: CLIENT_ID, ...claims }, privateKey, {
		algorithm: "RS256",
		keyid: "k1",
		...options,
	});

const respond = (payload) => ({
	ok: true,
	status: 200,
	text: async () => JSON.stringify(payload),
});

beforeEach(() => {
	idp = { idToken: null, userinfo: null };
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url) => {
			if (url === "https://idp.test/token") {
				return respond({ access_token: "access", id_token: idp.idToken });
			}
			if (url === "https://idp.test/jwks") {
				return respond({ keys: [jwk] });
			}
			if (url === "https://idp.test/userinfo") {
				return respond(idp.userinfo);
			}
			throw new Error(`Unexpected request to ${url}`);
		}),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("ID token nonce", () => {
	it("accepts a token carrying the nonce that was sent", async () => {
		idp.idToken = sign({ nonce: NONCE });

		const identity = await completeAuthorization(provider(), flow, "code");

		expect(identity.email).toBe("alice@example.com");
	});

	it("rejects a token with a different nonce", async () => {
		idp.idToken = sign({ nonce: "someone-elses" });

		await expect(completeAuthorization(provider(), flow, "code")).rejects.toThrow(/nonce/);
	});

	it("rejects a token that leaves the nonce out", async () => {
		idp.idToken = sign({});

		await expect(completeAuthorization(provider(), flow, "code")).rejects.toThrow(/nonce/);
	});
});

describe("ID token algorithm", () => {
	it("rejects a symmetric algorithm, whatever the token's header claims", async () => {
		idp.idToken = jwt.sign({ sub: "user-1", email: "alice@example.com", aud: CLIENT_ID, nonce: NONCE }, "secret", {
			algorithm: "HS256",
			keyid: "k1",
		});

		await expect(completeAuthorization(provider(), flow, "code")).rejects.toThrow();
	});
});

describe("merging ID token and userinfo claims", () => {
	it("prefers the signed ID token where the two disagree", async () => {
		idp.idToken = sign({ nonce: NONCE, email_verified: false, name: "Alice" });
		idp.userinfo = { sub: "user-1", email: "alice@example.com", email_verified: true, name: "Mallory" };

		const identity = await completeAuthorization(provider(), flow, "code");

		expect(identity.email_verified).toBe(false);
		expect(identity.name).toBe("Alice");
	});

	it("takes groups from userinfo when the ID token's list is empty", async () => {
		idp.idToken = sign({ nonce: NONCE, groups: [] });
		idp.userinfo = { sub: "user-1", groups: ["npm-admins"] };

		const identity = await completeAuthorization(provider(), flow, "code");

		expect(identity.groups).toEqual(["npm-admins"]);
	});

	it("keeps the ID token's groups when it has some", async () => {
		idp.idToken = sign({ nonce: NONCE, groups: ["staff"] });
		idp.userinfo = { sub: "user-1", groups: ["npm-admins"] };

		const identity = await completeAuthorization(provider(), flow, "code");

		expect(identity.groups).toEqual(["staff"]);
	});
});
