import * as api from "./base";
import type { StoredCredential } from "./getCredentials";

export async function createCredential(data: {
	name: string;
	dnsProvider: string;
	credentials: string;
}): Promise<StoredCredential> {
	return await api.post({ url: "/credentials", data });
}
