import * as api from "./base";

export async function deleteProxyHost(id: number, abortController?: AbortController): Promise<boolean> {
	return await api.del(
		{
			url: `/nginx/proxy-hosts/${id}`,
		},
		abortController,
	);
}
