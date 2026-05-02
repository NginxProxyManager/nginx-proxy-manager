import { get } from "./base";

export interface SsoProvidersResponse {
	oidc: boolean;
}

export function getSsoProviders(): Promise<SsoProvidersResponse> {
	return get({ url: "/sso/providers" });
}
