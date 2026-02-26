import AuthStore from "src/modules/AuthStore";

/** Fields that can be overridden by LDAP_* environment variables. */
export type LdapEnvOverrideFields = {
	serverUrl?: boolean;
	bindDN?: boolean;
	bindPassword?: boolean;
	searchBase?: boolean;
	groupDN?: boolean;
	userAttribute?: boolean;
	adminGroup?: boolean;
	userGroup?: boolean;
	enabled?: boolean;
	tlsVerify?: boolean;
	starttls?: boolean;
};

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
	/** Non-null when any LDAP_* env var is actively overriding a DB value. */
	envOverrides?: LdapEnvOverrideFields | null;
}

/**
 * Get LDAP settings. Bypasses humps transform (see updateLdapSettings.ts).
 */
export async function getLdapSettings(): Promise<LdapSettings> {
	const response = await fetch("/api/settings/ldap", {
		method: "GET",
		headers: {
			...( AuthStore.token ? { Authorization: `Bearer ${AuthStore.token.token}` } : {} ),
		},
	});
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error?.message || "Failed to load LDAP settings");
	}
	return payload;
}
