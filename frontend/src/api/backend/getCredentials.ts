import * as api from "./base";

export interface StoredCredential {
	id: number;
	name: string;
	dnsProvider: string;
	createdOn: string;
	modifiedOn: string;
	lastUsedAt?: string | null;
}

export async function getCredentials(): Promise<StoredCredential[]> {
	return await api.get({ url: "/credentials" });
}
