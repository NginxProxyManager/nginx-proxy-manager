import * as api from "./base";
import type { OidcConfig } from "./models";

export async function updateOidcConfig(config: OidcConfig): Promise<OidcConfig> {
	return await api.put({
		url: "/oidc/config",
		data: config,
	});
}
