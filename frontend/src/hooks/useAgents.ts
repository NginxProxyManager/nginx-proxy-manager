import { useQuery } from "@tanstack/react-query";
import { getAgents, type Agent } from "src/api/backend";

const fetchAgents = () => getAgents();

const useAgents = (options = {}) => {
	return useQuery<Agent[], Error>({
		queryKey: ["agents"],
		queryFn: fetchAgents,
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchAgents, useAgents };
