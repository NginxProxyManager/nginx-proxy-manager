import * as api from "./base";
import { paramsForAgent } from "./agentParams";
import type { User } from "./models";

export async function updateUser(item: User, agentId?: string): Promise<User> {
	// Remove readonly fields
	const { id, createdOn: _, modifiedOn: __, ...data } = item;

	return await api.put({
		url: `/users/${id}`,
		params: paramsForAgent(agentId),
		data: data,
	});
}
