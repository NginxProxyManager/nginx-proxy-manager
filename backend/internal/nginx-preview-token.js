import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const secret = process.env.NPM_NGINX_PREVIEW_TOKEN_SECRET || process.env.SECRET_KEY || randomBytes(32).toString("base64url");
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const signature = (value) => createHmac("sha256", secret).update(value).digest("base64url");

export const issuePreviewToken = ({ hostId = null, baseRevision = null, payloadHash, dependencyHash, templateHash, capabilityHash, expiresInSeconds = 300 }) => {
	const body = encode({ host_id: hostId, base_revision: baseRevision, payload_hash: payloadHash, dependency_hash: dependencyHash, template_hash: templateHash, capability_hash: capabilityHash, expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds });
	return `${body}.${signature(body)}`;
};

export const verifyPreviewToken = (token, expected = {}) => {
	if (typeof token !== "string" || !token.includes(".")) return { valid: false, reason: "missing" };
	const [body, received] = token.split(".");
	const actual = signature(body);
	if (received.length !== actual.length || !timingSafeEqual(Buffer.from(received), Buffer.from(actual))) return { valid: false, reason: "signature" };
	try {
		const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
		if (data.expires_at < Math.floor(Date.now() / 1000)) return { valid: false, reason: "expired" };
		for (const [key, value] of Object.entries(expected)) if (value !== undefined && data[key] !== value) return { valid: false, reason: key };
		return { valid: true, data };
	} catch {
		return { valid: false, reason: "malformed" };
	}
};

export default { issuePreviewToken, verifyPreviewToken };
