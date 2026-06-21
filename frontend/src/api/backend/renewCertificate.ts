import * as api from "./base";
import type { Certificate } from "./models";
import { paramsForAgent } from "./agentParams";

export async function renewCertificate(id: number, agentId?: string): Promise<Certificate> {
	return await api.post({
		url: `/nginx/certificates/${id}/renew`,
		params: paramsForAgent(agentId),
	});
}
