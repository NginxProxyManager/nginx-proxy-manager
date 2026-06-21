import * as api from "./base";
import { paramsForAgent } from "./agentParams";

export async function getHostsReport(agentId?: string): Promise<Record<string, number>> {
	return await api.get({
		url: "/reports/hosts",
		params: paramsForAgent(agentId),
	});
}
