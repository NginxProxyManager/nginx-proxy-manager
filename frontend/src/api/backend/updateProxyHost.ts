import * as api from "./base";
import type { ProxyHost } from "./models";

export async function updateProxyHost(item: ProxyHost, abortController?: AbortController): Promise<ProxyHost> {
	// Remove readonly fields
	const { id, createdOn: _, modifiedOn: __, ...data } = item;

	return await api.put(
		{
			url: `/nginx/proxy-hosts/${id}`,
			data: data,
		},
		abortController,
	);
}
