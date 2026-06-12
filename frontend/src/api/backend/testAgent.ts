import * as api from "./base";

export async function testAgent(id: number): Promise<{ ok: boolean }> {
	return await api.post({ url: `/agents/${id}/test` });
}
