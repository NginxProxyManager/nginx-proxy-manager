import crypto from "node:crypto";
import { LRUCache } from "lru-cache";
import * as client from "openid-client";

export const random = () => crypto.randomBytes(32).toString("base64url");
export const identityKey = (issuer, subject) =>
	crypto
		.createHash("sha256")
		.update(JSON.stringify([issuer, subject]))
		.digest("hex");

export function validateConfig(value) {
	if (!["auto", "client_secret_basic", "client_secret_post"].includes(value.token_auth_method || "auto"))
		throw new Error("Invalid token authentication method");
	if (typeof value.enabled !== "boolean" || typeof value.auto_login !== "boolean")
		throw new Error("Invalid OIDC switches");
	for (const key of ["issuer", "public_url"]) {
		if (!value.enabled && value[key] === "") continue;
		const url = new URL(value[key]);
		if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
			throw new Error("OIDC URLs must use HTTPS without credentials, query or fragment");
		if (key === "public_url" && url.pathname !== "/") throw new Error("Public URL must be an HTTPS origin");
	}
	if (!value.enabled) return;
	if (!value.client_id || !value.client_secret) throw new Error("Client ID and secret are required");
	if (!value.scopes.split(/\s+/).includes("openid")) throw new Error("Scopes must include openid");
}

// Secrets are encrypted using a key derived from NPM's existing persistent key.
export function seal(value, privateKey) {
	const key = crypto.createHash("sha256").update(privateKey).digest();
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
	return [iv, cipher.getAuthTag(), encrypted].map((v) => v.toString("base64url")).join(".");
}
export function unseal(value, privateKey) {
	const [iv, tag, encrypted] = value.split(".").map((v) => Buffer.from(v, "base64url"));
	const decipher = crypto.createDecipheriv(
		"aes-256-gcm",
		crypto.createHash("sha256").update(privateKey).digest(),
		iv,
	);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export class OneTimeStore {
	constructor(ttl = 300000) {
		this.cache = new LRUCache({ max: 1000, ttl });
	}
	put(value) {
		const key = random();
		this.cache.set(key, value);
		return key;
	}
	take(key) {
		const value = this.cache.get(key);
		this.cache.delete(key);
		return value;
	}
}

const discoveries = new LRUCache({ max: 8, ttl: 300000 });
export const clientAuthentication =
	(secret, method = "auto") =>
	(metadata, info, body, headers) => {
		const methods = metadata.token_endpoint_auth_methods_supported || ["client_secret_basic"];
		if (method === "client_secret_basic" || (method === "auto" && methods.includes("client_secret_basic")))
			return client.ClientSecretBasic(secret)(metadata, info, body, headers);
		if (method === "client_secret_post" || (method === "auto" && methods.includes("client_secret_post")))
			return client.ClientSecretPost(secret)(metadata, info, body, headers);
		throw new Error("Provider must support client_secret_basic or client_secret_post");
	};
export async function discover(config, revision) {
	let pending = discoveries.get(revision);
	if (!pending) {
		pending = client
			.discovery(
				new URL(config.issuer),
				config.client_id,
				{ client_secret: config.client_secret },
				clientAuthentication(config.client_secret, config.token_auth_method),
				{ timeout: 15, execute: [client.enableNonRepudiationChecks] },
			)
			.then((result) => {
				const metadata = result.serverMetadata();
				for (const value of [metadata.authorization_endpoint, metadata.token_endpoint, metadata.jwks_uri]) {
					const url = new URL(value);
					if (url.protocol !== "https:" || url.username || url.password)
						throw new Error("Insecure OIDC endpoint");
				}
				return result;
			})
			.catch((error) => {
				discoveries.delete(revision);
				throw error;
			});
		discoveries.set(revision, pending);
	}
	return pending;
}

export function sameOrigin(req, config) {
	return (
		req.get("Origin") === new URL(config.public_url).origin &&
		(!req.get("Sec-Fetch-Site") || req.get("Sec-Fetch-Site") === "same-origin") &&
		req.is("application/json")
	);
}

export { client };
