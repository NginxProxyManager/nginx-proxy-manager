import * as api from "./base";
import type { ProxyHost } from "./models";

export async function getProxyHost(id: number, abortController?: AbortController): Promise<ProxyHost> {
	return await api.get(
		{
			url: `/nginx/proxy-hosts/${id}`,
		},
		abortController,
	);
}
