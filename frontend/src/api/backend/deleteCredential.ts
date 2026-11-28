import * as api from "./base";

export async function deleteCredential(id: number): Promise<boolean> {
	return await api.del({ url: `/credentials/${id}` });
}
