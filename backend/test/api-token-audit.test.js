import assert from "node:assert/strict";
import { test } from "node:test";
import { apiTokenAuditMeta } from "../lib/api-token-audit.js";

test("PAT audit retains typed resource changes without arbitrary strings or nested secrets", () => {
	const meta = {
		name: "SECRET_NAME",
		domain_names: ["SECRET_DOMAIN"],
		certificate_id: 7,
		forward_port: 8080,
		forward_scheme: "https",
		enabled: false,
		items: [{ username: "test", password: "SECRET_PASSWORD" }],
		meta: { certificate_key: "SECRET_KEY" },
		advanced_config: "SECRET_CONFIG",
		secret: "SECRET_TOKEN",
		owner: { id: 2 },
	};
	const before = JSON.stringify(meta);
	assert.deepEqual(apiTokenAuditMeta(meta, 42), {
		api_token_id: 42,
		fields: [
			"advanced_config",
			"certificate_id",
			"domain_names",
			"enabled",
			"forward_port",
			"forward_scheme",
			"items",
			"meta",
			"name",
		],
		enabled: false,
		certificate_id: 7,
		forward_port: 8080,
		forward_scheme: "https",
		items_count: 1,
		domain_names_count: 1,
	});
	assert.equal(JSON.stringify(meta), before);
	assert.deepEqual(
		apiTokenAuditMeta({ enabled: "SECRET", certificate_id: { secret: 1 }, forward_scheme: "SECRET" }, 1),
		{
			api_token_id: 1,
			fields: ["certificate_id", "enabled", "forward_scheme"],
		},
	);
});
