import type { LdapSettingsPayload } from "./updateLdapSettings";
import AuthStore from "src/modules/AuthStore";

export interface LdapUser {
	dn: string;
	username: string;
	email: string;
	displayName: string;
	givenName?: string;
	surname?: string;
	memberOf?: string[];
}

export interface LdapAuthTestResult {
	success: boolean;
	message: string;
	user?: LdapUser;
}

export interface LdapAuthTestPayload extends LdapSettingsPayload {
	username: string;
	password: string;
}

/**
 * Test LDAP authentication. Bypasses humps transform (see updateLdapSettings.ts).
 */
export async function testLdapAuth(payload: LdapAuthTestPayload): Promise<LdapAuthTestResult> {
	const response = await fetch("/api/settings/ldap/test-auth", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...( AuthStore.token ? { Authorization: `Bearer ${AuthStore.token.token}` } : {} ),
		},
		body: JSON.stringify(payload),
	});
	const json = await response.json();
	if (!response.ok) {
		throw new Error(json.error?.message || json.error?.messageI18n || "Auth test failed");
	}
	return json;
}
