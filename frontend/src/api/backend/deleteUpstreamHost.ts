import * as api from "./base";

export async function deleteUpstreamHost(id: number): Promise<boolean> {
	return await api.del({
		url: `/nginx/upstream-hosts/${id}`,
	});
}
