import * as api from "./base";
import { paramsForAgent } from "./agentParams";

export async function deleteCertificate(id: number, agentId?: string): Promise<boolean> {
	return await api.del({
		url: `/nginx/certificates/${id}`,
		params: paramsForAgent(agentId),
	});
}
