import * as api from "./base";
import type { ProxyHost } from "./models";

export async function createProxyHost(item: ProxyHost, abortController?: AbortController): Promise<ProxyHost> {
	return await api.post(
		{
			url: "/nginx/proxy-hosts",
			// todo: only use whitelist of fields for this data
			data: item,
		},
		abortController,
	);
}
