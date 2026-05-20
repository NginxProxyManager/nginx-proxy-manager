import * as api from "./base";

export async function toggleProxyHost(id: number, enabled: boolean, agentId?: string): Promise<boolean> {
	return await api.post({
		url: `/nginx/proxy-hosts/${id}/${enabled ? "enable" : "disable"}`,
		params: agentId && agentId !== "local" ? { agent_id: agentId } : undefined,
	});
}
