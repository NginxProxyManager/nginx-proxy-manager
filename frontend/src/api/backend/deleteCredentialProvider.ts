import * as api from "./base";

export async function deleteCredentialProvider(id: number): Promise<boolean> {
	return await api.del({ url: `/credential-providers/${id}` });
}
