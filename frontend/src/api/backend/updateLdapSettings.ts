import type { LdapSettings } from "./getLdapSettings";
import AuthStore from "src/modules/AuthStore";
import { camelizeKeys } from "humps";

export type LdapSettingsPayload = Partial<Omit<LdapSettings, "id" | "createdOn" | "modifiedOn">>;

/**
 * Update LDAP settings.
 * Bypasses the global humps decamelizeKeys transform because LDAP fields
 * use non-standard casing (bindDN, groupDN) that humps mangles into
 * bind_d_n / group_d_n instead of the expected bind_dn / group_dn.
 */
export async function updateLdapSettings(data: LdapSettingsPayload): Promise<LdapSettings> {
	const response = await fetch("/api/settings/ldap", {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			...( AuthStore.token ? { Authorization: `Bearer ${AuthStore.token.token}` } : {} ),
		},
		body: JSON.stringify(data),
	});
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error?.message || payload.error?.messageI18n || "Failed to save LDAP settings");
	}
	return camelizeKeys(payload) as any;
}
