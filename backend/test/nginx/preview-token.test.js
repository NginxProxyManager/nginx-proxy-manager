import assert from "node:assert/strict";
import test from "node:test";
import { issuePreviewToken, verifyPreviewToken } from "../../internal/nginx-preview-token.js";

test("PREVIEW-001 token binds host, base revision, and rendered input hashes", () => {
	const token = issuePreviewToken({
		hostId: 42,
		baseRevision: 7,
		payloadHash: "payload",
		dependencyHash: "dependencies",
		templateHash: "template",
		capabilityHash: "capability",
	});
	const verified = verifyPreviewToken(token, { host_id: 42, base_revision: 7 });
	assert.equal(verified.valid, true);
	assert.equal(verified.data.payload_hash, "payload");
	assert.equal(verifyPreviewToken(token, { host_id: 43 }).reason, "host_id");
});

test("PREVIEW-002 token rejects a tampered signature and expired body", () => {
	const token = issuePreviewToken({ hostId: 1, baseRevision: 1, payloadHash: "a", dependencyHash: "b", templateHash: "c", capabilityHash: "d" });
	assert.equal(verifyPreviewToken(`${token}x`).valid, false);
	const expired = issuePreviewToken({ hostId: 1, baseRevision: 1, payloadHash: "a", dependencyHash: "b", templateHash: "c", capabilityHash: "d", expiresInSeconds: -1 });
	assert.equal(verifyPreviewToken(expired).reason, "expired");
});
