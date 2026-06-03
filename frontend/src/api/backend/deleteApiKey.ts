import * as api from "./base";

export async function deleteApiKey(id: number): Promise<boolean> {
	return await api.del({ url: `/api-keys/${id}` });
}
