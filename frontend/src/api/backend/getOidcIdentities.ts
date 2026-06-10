import * as api from "./base";

export interface OidcIdentity {
	providerId: string;
	providerName: string;
	linkedOn: string;
}

export async function getOidcIdentities(): Promise<OidcIdentity[]> {
	return await api.get({
		url: "/oidc/identities",
	});
}
