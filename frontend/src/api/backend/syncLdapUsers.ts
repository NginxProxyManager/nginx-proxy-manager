import * as api from "./base";

export interface LdapSyncDetail {
	userId: number;
	email: string;
	status: "synced" | "disabled" | "skipped" | "error";
	isAdmin?: boolean;
	reason?: string;
}

export interface LdapSyncResult {
	synced: number;
	disabled: number;
	errors: number;
	details: LdapSyncDetail[];
}

/**
 * POST /api/settings/ldap/sync
 *
 * Force re-synchronise all LDAP-provisioned NPM users against the LDAP directory.
 * Requires admin access.
 */
export async function syncLdapUsers(): Promise<LdapSyncResult> {
	return await api.post({
		url: "/settings/ldap/sync",
	});
}
