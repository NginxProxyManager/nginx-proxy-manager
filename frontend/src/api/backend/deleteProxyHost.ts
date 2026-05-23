import * as api from "./base";

export async function deleteProxyHost(id: number): Promise<boolean> {
	return await api.del({
		url: `/nginx/proxy-hosts/${id}`,
	});
}
