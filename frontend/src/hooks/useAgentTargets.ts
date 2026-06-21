import { useMemo } from "react";
import type { Agent } from "src/api/backend";
import { useAgents } from "./useAgents";

export interface AgentTarget {
	id: string;
	name: string;
	subtitle: string;
	isLocal?: boolean;
	agent?: Agent;
}

const localAgentTarget: AgentTarget = {
	id: "local",
	name: "Current node",
	subtitle: "local",
	isLocal: true,
};

const useAgentTargets = () => {
	const agentsQuery = useAgents();
	const targets = useMemo<AgentTarget[]>(() => {
		const enabledAgents = (agentsQuery.data ?? [])
			.filter((agent) => agent.enabled)
			.map((agent) => ({
				id: `${agent.id}`,
				name: agent.name || agent.url,
				subtitle: `agent #${agent.id}${agent.url ? ` · ${agent.url}` : ""}`,
				agent,
			}));
		return [localAgentTarget, ...enabledAgents];
	}, [agentsQuery.data]);

	return {
		...agentsQuery,
		targets,
	};
};

export { useAgentTargets, localAgentTarget };
