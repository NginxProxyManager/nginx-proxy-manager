import * as api from "./base";

export interface LdapSettings {
	id: number | null;
	serverUrl: string;
	bindDN: string;
	bindPassword: string;
	searchBase: string;
	userFilter: string;
	groupDN: string;
	userAttribute: "uid" | "sAMAccountName" | "mail" | "userPrincipalName";
	adminGroup: string;
	userGroup: string;
	enabled: boolean;
	tlsVerify: boolean;
	starttls: boolean;
	createdOn?: string;
	modifiedOn?: string;
}

export async function getLdapSettings(): Promise<LdapSettings> {
	return await api.get({ url: "/settings/ldap" });
}
