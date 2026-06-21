import * as api from "./base";
import type { Certificate } from "./models";
import { paramsForAgent } from "./agentParams";

export async function uploadCertificate(id: number, data: FormData, agentId?: string): Promise<Certificate> {
	return await api.post({
		url: `/nginx/certificates/${id}/upload`,
		params: paramsForAgent(agentId),
		data,
	});
}
