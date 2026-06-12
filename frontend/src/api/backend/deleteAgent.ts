import * as api from "./base";

export async function deleteAgent(id: number): Promise<boolean> {
	return await api.del({ url: `/agents/${id}` });
}
