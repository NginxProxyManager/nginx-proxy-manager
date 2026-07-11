import * as api from "./base";

export async function testDnsProvider(id: number): Promise<{ ok: boolean; error?: string }> {
	return await api.get({
		url: `/nginx/dns-providers/${id}/test`,
	});
}
