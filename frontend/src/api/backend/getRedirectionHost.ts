import * as api from "./base";
import type { ProxyHost } from "./models";

export async function getRedirectionHost(id: number, abortController?: AbortController): Promise<ProxyHost> {
	return await api.get(
		{
			url: `/nginx/redirection-hosts/${id}`,
		},
		abortController,
	);
}
