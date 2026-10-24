import { describe, expect, it } from "vitest";
import en from "./src/en.json";
import et from "./src/et.json";

const english = en as Record<string, { defaultMessage: string }>;
const estonian = et as Record<string, { defaultMessage: string }>;

// SSO and its capability-management additions ship with English and Vietnamese
// source copy. Other locales intentionally use the established English fallback.
const fallbackPrefixes = ["settings.sso."];
const fallbackKeys = new Set([
	"login.sso-administrator-password",
	"login.sso-denied",
	"login.sso-or",
	"login.sso-unsupported-profile",
	"logout.unconfirmed",
	"pending-access.description",
	"pending-access.profile-unavailable",
	"pending-access.title",
	"permissions.capabilities",
	"permissions.certificate-authorities",
	"permissions.dns-providers",
	"permissions.nginx-templates",
	"user.password-login-enabled",
]);

// Brand names, codes and ICU-only strings can stay the same as English.
const allowedIdentical = new Set([
	"certificates.key-type-ecdsa",
	"certificates.key-type-rsa",
	"column.ssl",
	"lets-encrypt",
	"object.actions-title",
	"streams.tcp",
	"streams.udp",
]);

describe("Estonian UI locale", () => {
	it("covers every English UI key", () => {
		const missing = Object.keys(english).filter(
			(key) =>
				!(key in estonian) &&
				!fallbackKeys.has(key) &&
				!fallbackPrefixes.some((prefix) => key.startsWith(prefix)),
		);
		expect(missing).toEqual([]);
	});

	it("does not add keys that are missing from English", () => {
		const extra = Object.keys(estonian).filter((key) => !(key in english));
		expect(extra).toEqual([]);
	});

	it("is translated, not an English copy", () => {
		const identical = Object.keys(english).filter(
			(key) => estonian[key]?.defaultMessage === english[key]?.defaultMessage,
		);
		const unexpected = identical.filter((key) => !allowedIdentical.has(key));
		expect(unexpected).toEqual([]);
	});

	it("keeps ICU data placeholders from English strings", () => {
		const argNames = [
			"count",
			"object",
			"objects",
			"id",
			"date",
			"users",
			"rules",
			"max",
			"min",
			"domain",
			"code",
			"latestVersion",
			"name",
		];
		const usedArgs = (message: string) => argNames.filter((name) => message.includes(`{${name}`));
		const broken: string[] = [];

		for (const key of Object.keys(english)) {
			const expected = usedArgs(english[key].defaultMessage).join(",");
			const actual = usedArgs(estonian[key]?.defaultMessage ?? "").join(",");
			if (expected !== actual) {
				broken.push(`${key}: expected {${expected}} got {${actual}}`);
			}
		}

		expect(broken).toEqual([]);
	});
});
