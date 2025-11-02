import * as api from "./base";
import type { ProxyHostExpansion } from "./expansions";
import type { ProxyHost } from "./models";

export async function getProxyHosts(expand?: ProxyHostExpansion[], params = {}): Promise<ProxyHost[]> {
	return await api.get({
		url: "/nginx/proxy-hosts",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
