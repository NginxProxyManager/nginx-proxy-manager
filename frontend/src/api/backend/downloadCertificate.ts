import * as api from "./base";
import { paramsForAgent } from "./agentParams";

export async function downloadCertificate(id: number, agentId?: string): Promise<void> {
	await api.download(
		{
			url: `/nginx/certificates/${id}/download`,
			params: paramsForAgent(agentId),
		},
		`certificate-${id}.zip`,
	);
}
