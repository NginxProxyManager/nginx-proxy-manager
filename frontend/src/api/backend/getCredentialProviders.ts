import * as api from "./base";

export interface CredentialProvider {
	id: number;
	name: string;
	type: string;
	oidcIssuer?: string;
	oidcClientId?: string;
	oidcAudience?: string;
	oidcScope?: string;
	meta: Record<string, unknown>;
	hasOidcSecret?: boolean;
}

export async function getCredentialProviders(): Promise<CredentialProvider[]> {
	return await api.get({ url: "/credential-providers" });
}
