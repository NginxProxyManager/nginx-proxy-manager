import { useQuery } from "@tanstack/react-query";
import { type AccessList, type AccessListExpansion, getAccessLists } from "src/api/backend";

const paramsForAgent = (agentId?: string) => (agentId && agentId !== "local" ? { agent_id: agentId } : {});

const fetchAccessLists = (expand?: AccessListExpansion[], agentId?: string) => {
	return getAccessLists(expand, paramsForAgent(agentId));
};

const useAccessLists = (expand?: AccessListExpansion[], options: any = {}, agentId?: string) => {
	return useQuery<AccessList[], Error>({
		queryKey: ["access-lists", { expand, agentId }],
		queryFn: () => fetchAccessLists(expand, agentId),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchAccessLists, useAccessLists };
