import * as api from "./base";
import { paramsForAgent } from "./agentParams";
import type { ValidatedCertificateResponse } from "./responseTypes";

export async function validateCertificate(data: FormData, agentId?: string): Promise<ValidatedCertificateResponse> {
	return await api.post({
		url: "/nginx/certificates/validate",
		params: paramsForAgent(agentId),
		data,
	});
}
