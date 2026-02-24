import * as api from "./base";
import type { LdapSettings } from "./getLdapSettings";

export type LdapSettingsPayload = Partial<Omit<LdapSettings, "id" | "createdOn" | "modifiedOn">>;

export async function updateLdapSettings(data: LdapSettingsPayload): Promise<LdapSettings> {
	return await api.put({ url: "/settings/ldap", data });
}
