import { describe, expect, it, vi } from "vitest";

// canLinkByEmail is a pure decision; provision.js reaches the database for
// everything else, so stub the models rather than opening a connection.
vi.mock("../models/auth.js", () => ({ default: {} }));
vi.mock("../models/user.js", () => ({ default: {} }));
vi.mock("../models/user_permission.js", () => ({ default: {} }));
vi.mock("../models/setting.js", () => ({ default: {} }));
vi.mock("../models/auth_provider.js", () => ({ default: {} }));

const { canLinkByEmail } = await import("../lib/auth/provision.js");

const provider = (type, linkByEmail) => ({
	name: `Test ${type}`,
	type,
	meta: { link_by_email: linkByEmail },
});

const identity = (extra = {}) => ({ email: "alice@example.com", ...extra });

describe("canLinkByEmail", () => {
	it("refuses by default, whatever the provider type", () => {
		for (const type of ["ldap", "saml", "oauth"]) {
			expect(canLinkByEmail(provider(type, false), identity({ email_verified: true }))).toBe(false);
			expect(canLinkByEmail({ name: "x", type, meta: {} }, identity({ email_verified: true }))).toBe(false);
		}
	});

	it("allows a directory to vouch for an address once configured", () => {
		expect(canLinkByEmail(provider("ldap", true), identity())).toBe(true);
		expect(canLinkByEmail(provider("saml", true), identity())).toBe(true);
	});

	it("requires OIDC to say the address was verified", () => {
		expect(canLinkByEmail(provider("oauth", true), identity({ email_verified: true }))).toBe(true);
		expect(canLinkByEmail(provider("oauth", true), identity({ email_verified: false }))).toBe(false);
		// A provider that never sends the claim is not vouching for anything
		expect(canLinkByEmail(provider("oauth", true), identity())).toBe(false);
	});

	it("does not accept a truthy value in place of a verified address", () => {
		// The claim is normalised to a real boolean upstream, so anything else
		// reaching here means the provider said something we cannot read
		expect(canLinkByEmail(provider("oauth", true), identity({ email_verified: "yes" }))).toBe(false);
		expect(canLinkByEmail(provider("oauth", true), identity({ email_verified: 1 }))).toBe(false);
	});
});
