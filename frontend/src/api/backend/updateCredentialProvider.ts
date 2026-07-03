import * as api from "./base";
import type { CredentialProvider } from "./getCredentialProviders";

export async function updateCredentialProvider(
	id: number,
	data: Record<string, unknown>,
): Promise<CredentialProvider> {
	return await api.put({ url: `/credential-providers/${id}`, data });
}
