import * as api from "./base";

export async function deleteProxyHost(id: number, agentId?: string): Promise<boolean> {
	return await api.del({
		url: `/nginx/proxy-hosts/${id}`,
		params: agentId && agentId !== "local" ? { agent_id: agentId } : undefined,
	});
}
