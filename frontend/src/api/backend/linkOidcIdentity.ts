import * as api from "./base";

export interface LinkOidcIdentityPayload {
	providerId: string;
	codeVerifier: string;
	nonce: string;
	queryString: string;
	callbackUrl: string;
	state: string;
}

export interface LinkOidcResult {
	linked: boolean;
}

export async function linkOidcIdentity(payload: LinkOidcIdentityPayload): Promise<LinkOidcResult> {
	return await api.post({
		url: "/oidc/link",
		data: payload,
	});
}
