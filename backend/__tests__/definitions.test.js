import { describe, expect, it } from "vitest";
import { DEFAULTS, normalizeMeta, PROVIDER_TYPES, redactProvider, SECRET_FIELDS } from "../lib/auth/definitions.js";

describe("normalizeMeta", () => {
	it("fills in the defaults for a type", () => {
		const meta = normalizeMeta("ldap", {});
		expect(meta.email_attribute).toBe("mail");
		expect(meta.tls_reject_unauthorized).toBe(true);
		expect(meta.auto_create_user).toBe(false);
	});

	it("keeps supplied values", () => {
		const meta = normalizeMeta("ldap", { url: "ldaps://example.com", email_attribute: "userPrincipalName" });
		expect(meta.url).toBe("ldaps://example.com");
		expect(meta.email_attribute).toBe("userPrincipalName");
	});

	it("drops keys the type does not know about, so nothing arbitrary is persisted", () => {
		const meta = normalizeMeta("ldap", { url: "ldap://x", evil: "payload", __proto__: { polluted: true } });
		expect(meta.evil).toBeUndefined();
		expect(meta.polluted).toBeUndefined();
		expect(Object.hasOwn(meta, "evil")).toBe(false);
	});

	it("does not leak fields between provider types", () => {
		const meta = normalizeMeta("saml", { client_secret: "oauth-only", entry_point: "https://idp" });
		expect(meta.client_secret).toBeUndefined();
		expect(meta.entry_point).toBe("https://idp");
	});

	it("treats null as absent so a default applies", () => {
		expect(normalizeMeta("ldap", { email_attribute: null }).email_attribute).toBe("mail");
	});

	it("preserves false rather than replacing it with a truthy default", () => {
		expect(normalizeMeta("ldap", { tls_reject_unauthorized: false }).tls_reject_unauthorized).toBe(false);
	});

	it("returns an empty object for an unknown type", () => {
		expect(normalizeMeta("carrier-pigeon", { a: 1 })).toEqual({});
	});

	it("covers every declared provider type", () => {
		for (const type of PROVIDER_TYPES) {
			expect(DEFAULTS[type]).toBeDefined();
			expect(Object.keys(normalizeMeta(type, {})).length).toBeGreaterThan(0);
		}
	});
});

describe("redactProvider", () => {
	it("removes the secret and reports only whether one is stored", () => {
		const redacted = redactProvider({
			id: 1,
			type: "ldap",
			meta: { url: "ldap://x", bind_password: "topsecret" },
		});

		expect(redacted.meta.bind_password).toBeUndefined();
		expect(redacted.meta.bind_password_set).toBe(true);
		expect(redacted.meta.url).toBe("ldap://x");
	});

	it("reports false when no secret is stored", () => {
		const redacted = redactProvider({ type: "ldap", meta: { bind_password: "" } });
		expect(redacted.meta.bind_password_set).toBe(false);
	});

	it("redacts the secret of every provider type", () => {
		for (const type of PROVIDER_TYPES) {
			const meta = {};
			for (const field of SECRET_FIELDS[type]) {
				meta[field] = "a-secret";
			}

			const redacted = redactProvider({ type, meta });

			for (const field of SECRET_FIELDS[type]) {
				expect(redacted.meta[field]).toBeUndefined();
				expect(redacted.meta[`${field}_set`]).toBe(true);
			}
			expect(JSON.stringify(redacted)).not.toContain("a-secret");
		}
	});

	it("does not mutate the row it was given", () => {
		const row = { type: "ldap", meta: { bind_password: "topsecret" } };
		redactProvider(row);
		expect(row.meta.bind_password).toBe("topsecret");
	});

	it("passes null and undefined straight through", () => {
		expect(redactProvider(null)).toBeNull();
		expect(redactProvider(undefined)).toBeUndefined();
	});
});
