import * as api from "./base";

export interface ApiKey {
	id: number;
	name: string;
	keyPrefix: string;
	permissions: Record<string, string>;
	expiresOn?: string | null;
	lastUsedAt?: string | null;
	createdOn: string;
}

export async function getApiKeys(): Promise<ApiKey[]> {
	return await api.get({ url: "/api-keys" });
}
