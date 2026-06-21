import * as api from "./base";
import type { Certificate } from "./models";
import { paramsForAgent } from "./agentParams";

export async function createCertificate(item: Certificate, agentId?: string): Promise<Certificate> {
	return await api.post({
		url: "/nginx/certificates",
		params: paramsForAgent(agentId),
		data: item,
	});
}
