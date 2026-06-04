import * as api from "./base";
import type { StoredCredential } from "./getCredentials";

export async function updateCredential(
	id: number,
	data: Partial<{ name: string; dnsProvider: string; credentials: string }>,
): Promise<StoredCredential> {
	return await api.put({ url: `/credentials/${id}`, data });
}
