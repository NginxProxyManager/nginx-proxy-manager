import * as api from "./base";
import type { CertificateExpansion } from "./expansions";
import type { Certificate } from "./models";
import { paramsForAgent } from "./agentParams";

export async function getCertificate(id: number, expand?: CertificateExpansion[], agentId?: string): Promise<Certificate> {
	return await api.get({
		url: `/nginx/certificates/${id}`,
		params: {
			expand: expand?.join(","),
			...paramsForAgent(agentId),
		},
	});
}
