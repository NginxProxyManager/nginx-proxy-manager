import * as api from "./base";
import { paramsForAgent } from "./agentParams";

export async function testHttpCertificate(domains: string[], agentId?: string): Promise<Record<string, string>> {
	return await api.post({
		url: "/nginx/certificates/test-http",
		params: paramsForAgent(agentId),
		data: {
			domains,
		},
	});
}
