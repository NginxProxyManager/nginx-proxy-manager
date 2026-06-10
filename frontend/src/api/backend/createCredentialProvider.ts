import * as api from "./base";
import type { CredentialProvider } from "./getCredentialProviders";

export async function createCredentialProvider(data: Record<string, unknown>): Promise<CredentialProvider> {
	return await api.post({ url: "/credential-providers", data });
}
