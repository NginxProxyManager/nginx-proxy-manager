import crypto from "node:crypto";

export const resources = ["proxy_hosts", "redirection_hosts", "dead_hosts", "streams", "access_lists", "certificates"];
export const scopes = resources.flatMap((resource) => [`${resource}:read`, `${resource}:write`]);
export const tokenPrefix = "npm_pat_";
export const tokenPattern = /^npm_pat_([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/;
export const hashSecret = (secret) => crypto.createHash("sha256").update(secret).digest("hex");
export const generateToken = () => {
	const publicId = crypto.randomBytes(12).toString("hex");
	const secret = crypto.randomBytes(32).toString("base64url");
	return { publicId, hash: hashSecret(secret), token: `${tokenPrefix}${publicId}.${secret}` };
};
export const verifySecret = (secret, hash) => {
	if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) return false;
	return crypto.timingSafeEqual(Buffer.from(hashSecret(secret), "hex"), Buffer.from(hash, "hex"));
};
// Authentication and management responses use the same lifecycle rules. A
// credential-version mismatch is permanent invalidation, not merely expiry.
export const tokenStatus = (token, user, auth, now = Date.now()) => {
	if (
		token.revoked_on ||
		!user ||
		user.is_deleted ||
		user.is_disabled ||
		user.api_token_version !== token.owner_version ||
		!auth ||
		hashSecret(auth.secret) !== token.password_version
	)
		return "revoked";
	const expires = new Date(token.expires_on).getTime();
	return !Number.isFinite(expires) || expires <= now ? "expired" : "active";
};

export const permits = (granted, resource, mode) =>
	["read", "write"].includes(mode) &&
	resources.includes(resource) &&
	(granted.includes(`${resource}:write`) || (mode === "read" && granted.includes(`${resource}:read`)));

// Exact operation registry: new endpoints never acquire PAT access implicitly.
export const operationFor = (method, path) => {
	const match =
		/^\/nginx\/(proxy-hosts|redirection-hosts|dead-hosts|streams|access-lists|certificates)(?:\/([1-9][0-9]*)(?:\/(enable|disable|upload|renew))?)?$/.exec(
			path,
		);
	if (!match) return null;
	const resource = match[1].replaceAll("-", "_");
	const id = match[2] ? Number(match[2]) : null;
	if (id !== null && !Number.isSafeInteger(id)) return null;
	const action = match[3];
	if (!action && method === "GET") return { resource, mode: "read", id };
	if (!id && method === "POST") return { resource, mode: "write", id };
	if (id && !action && method === "DELETE") return { resource, mode: "write", id };
	if (id && !action && method === "PUT" && resource !== "certificates") return { resource, mode: "write", id };
	if (id && method === "POST") {
		if (["enable", "disable"].includes(action) && !["access_lists", "certificates"].includes(resource)) {
			return { resource, mode: "write", id };
		}
		if (["upload", "renew"].includes(action) && resource === "certificates") return { resource, mode: "write", id };
	}
	return null;
};

const hidden = new Set([
	"owner",
	"certificate",
	"access_list",
	"proxy_hosts",
	"redirection_hosts",
	"dead_hosts",
	"streams",
	"secret",
	"secret_hash",
	"password",
	"dns_provider_credentials",
	"certificate_key",
	"totp_secret",
	"totp_pending_secret",
	"backup_codes",
	"debug",
]);
// Only the HTTP response is redacted. Internal expanded rows needed to render
// Nginx configuration are unchanged. Raw config strings are deliberately retained.
export const redactResponse = (value) => {
	if (Array.isArray(value)) return value.map(redactResponse);
	if (value && typeof value === "object" && !(value instanceof Date)) {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => !hidden.has(key))
				.map(([key, item]) => [key, redactResponse(item)]),
		);
	}
	return value;
};

// Legacy handlers may mark command stderr as public. PAT callers receive only
// bounded protocol errors, never provider output or validation diagnostics.
export const redactErrorResponse = (status) => ({
	error: {
		code: status,
		message:
			{
				400: "Invalid request",
				401: "Invalid or expired API token",
				403: "Permission Denied",
				404: "Item not found",
				429: "Too many requests",
			}[status] || "Internal Error",
	},
});

// PATs deliberately cannot submit arbitrary Nginx directives. Validate the
// other unquoted/interpolated text fields too; legacy schemas are permissive.
export const hasUnsafeConfiguration = (record) => {
	if (!record || typeof record !== "object") return false;
	if (
		record.advanced_config !== undefined &&
		(typeof record.advanced_config !== "string" || record.advanced_config.trim())
	)
		return true;
	for (const field of ["forward_host", "forwarding_host"]) {
		if (record[field] !== undefined && !/^[A-Za-z0-9_.:[\]-]+$/.test(record[field])) return true;
	}
	if (record.forward_domain_name !== undefined && /[\s;{}$\\"'#]/.test(record.forward_domain_name)) return true;
	if (
		record.forward_path !== undefined &&
		record.forward_path !== "" &&
		!/^\/[A-Za-z0-9._~%/+,:=@&!()*?-]*$/.test(record.forward_path)
	)
		return true;
	if (record.path !== undefined && !/^\/[A-Za-z0-9._~%/+,:=@&!()*-]*$/.test(record.path)) return true;
	if (
		record.domain_names !== undefined &&
		(!Array.isArray(record.domain_names) ||
			record.domain_names.some((name) => typeof name !== "string" || !/^[A-Za-z0-9.*_-]+$/.test(name)))
	)
		return true;
	if (
		record.clients !== undefined &&
		(!Array.isArray(record.clients) ||
			record.clients.some(
				(client) =>
					!client || typeof client.address !== "string" || !/^[A-Za-z0-9_.:/%-]+$/.test(client.address),
			))
	)
		return true;
	if (
		record.locations !== undefined &&
		(!Array.isArray(record.locations) || record.locations.some(hasUnsafeConfiguration))
	)
		return true;
	return false;
};
