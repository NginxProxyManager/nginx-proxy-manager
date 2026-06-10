import { useQuery } from "@tanstack/react-query";
import { type UpstreamHost, type UpstreamHostExpansion, getUpstreamHosts } from "src/api/backend";

const fetchUpstreamHosts = (expand?: UpstreamHostExpansion[]) => {
	return getUpstreamHosts(expand);
};

const useUpstreamHosts = (expand?: UpstreamHostExpansion[], options = {}) => {
	return useQuery<UpstreamHost[], Error>({
		queryKey: ["upstream-hosts", { expand }],
		queryFn: () => fetchUpstreamHosts(expand),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchUpstreamHosts, useUpstreamHosts };
