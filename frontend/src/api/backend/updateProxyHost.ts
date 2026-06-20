import * as api from "./base";
import type { ProxyHost } from "./models";

export async function updateProxyHost(item: ProxyHost & { agentId?: string }): Promise<ProxyHost> {
	// Remove readonly fields
	const { id, createdOn: _, modifiedOn: __, agentId, ...data } = item;

	return await api.put({
		url: `/nginx/proxy-hosts/${id}`,
		params: agentId && agentId !== "local" ? { agent_id: agentId } : undefined,
		data: data,
	});
}
