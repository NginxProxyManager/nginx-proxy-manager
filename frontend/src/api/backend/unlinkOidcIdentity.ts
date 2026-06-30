import * as api from "./base";

export interface UnlinkOidcResult {
	unlinked: boolean;
}

export async function unlinkOidcIdentity(providerId: string): Promise<UnlinkOidcResult> {
	return await api.del({
		url: `/oidc/link/${encodeURIComponent(providerId)}`,
	});
}
