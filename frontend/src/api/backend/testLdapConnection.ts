import * as api from "./base";
import type { LdapSettingsPayload } from "./updateLdapSettings";

export interface LdapTestResult {
	success: boolean;
	message: string;
}

export async function testLdapConnection(config: LdapSettingsPayload = {}): Promise<LdapTestResult> {
	return await api.post({ url: "/settings/ldap/test", data: config });
}
