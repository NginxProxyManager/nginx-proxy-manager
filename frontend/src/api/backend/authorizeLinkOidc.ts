import * as api from "./base";

export interface AuthorizeLinkOidcResult {
	authorizeUrl: string;
	codeVerifier: string;
	nonce: string;
	state: string;
	callbackUrl: string;
}

export async function authorizeLinkOidc(providerId: string): Promise<AuthorizeLinkOidcResult> {
	const callbackUrl = `${window.location.origin}/api/oidc/link-callback`;
	return await api.get({
		url: `/oidc/${encodeURIComponent(providerId)}/authorize-link`,
		params: { callbackUrl },
	});
}
