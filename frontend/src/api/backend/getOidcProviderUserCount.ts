import * as api from "./base";

export interface OidcProviderUserCount {
	total: number;
	oidcOnly: number;
}

export async function getOidcProviderUserCount(providerId: string): Promise<OidcProviderUserCount> {
	return await api.get({
		url: `/oidc/config/provider-users/${encodeURIComponent(providerId)}`,
	});
}
