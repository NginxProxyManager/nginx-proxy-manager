import { useQuery } from "@tanstack/react-query";
import { getUsers, type User, type UserExpansion } from "src/api/backend";

const paramsForAgent = (agentId?: string) => (agentId && agentId !== "local" ? { agent_id: agentId } : {});

const fetchUsers = (expand?: UserExpansion[], agentId?: string) => {
	return getUsers(expand, paramsForAgent(agentId));
};

const useUsers = (expand?: UserExpansion[], options = {}, agentId?: string) => {
	return useQuery<User[], Error>({
		queryKey: ["users", { expand, agentId }],
		queryFn: () => fetchUsers(expand, agentId),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchUsers, useUsers };
