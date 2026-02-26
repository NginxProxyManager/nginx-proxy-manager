import type { LdapSettingsPayload } from "./updateLdapSettings";
import AuthStore from "src/modules/AuthStore";

export interface LdapTestResult {
	success: boolean;
	message: string;
}

/**
 * Test LDAP connection. Bypasses humps transform (see updateLdapSettings.ts).
 */
export async function testLdapConnection(config: LdapSettingsPayload = {}): Promise<LdapTestResult> {
	const response = await fetch("/api/settings/ldap/test", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...( AuthStore.token ? { Authorization: `Bearer ${AuthStore.token.token}` } : {} ),
		},
		body: JSON.stringify(config),
	});
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error?.message || payload.error?.messageI18n || "Connection test failed");
	}
	return payload;
}
