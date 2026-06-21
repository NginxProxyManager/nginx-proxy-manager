import * as api from "./base";
import { paramsForAgent } from "./agentParams";
import type { LoginAsTokenResponse } from "./responseTypes";

export async function loginAsUser(id: number, agentId?: string): Promise<LoginAsTokenResponse> {
	return await api.post({
		url: `/users/${id}/login`,
		params: paramsForAgent(agentId),
	});
}
