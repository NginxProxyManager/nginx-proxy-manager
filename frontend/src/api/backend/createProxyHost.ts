import * as api from "./base";
import type { ProxyHost } from "./models";

export async function createProxyHost(item: ProxyHost & { agentId?: string }): Promise<ProxyHost> {
	const { agentId, ...data } = item;
	return await api.post({
		url: "/nginx/proxy-hosts",
		params: agentId && agentId !== "local" ? { agent_id: agentId } : undefined,
		data,
	});
}
