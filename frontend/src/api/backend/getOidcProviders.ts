import * as api from "./base";
import type { OidcProvider } from "./models";

export async function getOidcProviders(): Promise<OidcProvider[]> {
	return await api.get({
		url: "/oidc/providers",
		noAuth: true,
	});
}
