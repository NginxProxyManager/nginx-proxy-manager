import * as api from "./base";
import type { ProxyHost } from "./models";

export type ProxyHostExpansion = "owner" | "access_list" | "certificate";

export async function getProxyHosts(expand?: ProxyHostExpansion[], params = {}): Promise<ProxyHost[]> {
	return await api.get({
		url: "/nginx/proxy-hosts",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
