import * as api from "./base";
import { paramsForAgent } from "./agentParams";
import type { UserPermissions } from "./models";

export async function setPermissions(userId: number, data: UserPermissions, agentId?: string): Promise<boolean> {
	// Remove readonly fields
	return await api.put({
		url: `/users/${userId}/permissions`,
		params: paramsForAgent(agentId),
		data,
	});
}
