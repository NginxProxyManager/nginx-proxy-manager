export const paramsForAgent = (agentId?: string) => (agentId && agentId !== "local" ? { agent_id: agentId } : undefined);
