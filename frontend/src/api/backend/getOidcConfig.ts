import * as api from "./base";
import type { OidcConfig } from "./models";

export async function getOidcConfig(): Promise<OidcConfig> {
	return await api.get({
		url: "/oidc/config",
	});
}
