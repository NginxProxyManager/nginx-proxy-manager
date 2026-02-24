import * as api from "./base";
import type { LdapSettingsPayload } from "./updateLdapSettings";

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

export async function testLdapAuth(payload: LdapAuthTestPayload): Promise<LdapAuthTestResult> {
	return await api.post({ url: "/settings/ldap/test-auth", data: payload });
}
