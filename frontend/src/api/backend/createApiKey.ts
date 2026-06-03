import * as api from "./base";
import type { ApiKey } from "./getApiKeys";

export async function createApiKey(data: {
	name: string;
	permissions?: Record<string, string>;
	expiresOn?: string | null;
}): Promise<ApiKey & { key?: string }> {
	return await api.post({ url: "/api-keys", data });
}
