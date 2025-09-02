import { useQuery } from "@tanstack/react-query";
import { type DeadHost, type DeadHostExpansion, getDeadHosts } from "src/api/backend";

const fetchDeadHosts = (expand?: DeadHostExpansion[]) => {
	return getDeadHosts(expand);
};

const useDeadHosts = (expand?: DeadHostExpansion[], options = {}) => {
	return useQuery<DeadHost[], Error>({
		queryKey: ["dead-hosts", { expand }],
		queryFn: () => fetchDeadHosts(expand),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchDeadHosts, useDeadHosts };
