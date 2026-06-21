import * as api from "./base";
import { paramsForAgent } from "./agentParams";

export async function deleteUser(id: number, agentId?: string): Promise<boolean> {
	return await api.del({
		url: `/users/${id}`,
		params: paramsForAgent(agentId),
	});
}
