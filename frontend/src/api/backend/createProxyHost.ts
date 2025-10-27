import * as api from "./base";
import type { ProxyHost } from "./models";

export async function createProxyHost(item: ProxyHost): Promise<ProxyHost> {
	return await api.post({
		url: "/nginx/proxy-hosts",
		data: item,
	});
}
