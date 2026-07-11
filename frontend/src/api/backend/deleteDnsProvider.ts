import * as api from "./base";

export async function deleteDnsProvider(id: number): Promise<boolean> {
	return await api.del({
		url: `/nginx/dns-providers/${id}`,
	});
}
