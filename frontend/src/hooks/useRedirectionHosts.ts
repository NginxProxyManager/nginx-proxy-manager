import { useQuery } from "@tanstack/react-query";
import { getRedirectionHosts, type HostExpansion, type RedirectionHost } from "src/api/backend";

const fetchRedirectionHosts = (expand?: HostExpansion[]) => {
	return getRedirectionHosts(expand);
};

const useRedirectionHosts = (expand?: HostExpansion[], options = {}) => {
	return useQuery<RedirectionHost[], Error>({
		queryKey: ["redirection-hosts", { expand }],
		queryFn: () => fetchRedirectionHosts(expand),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchRedirectionHosts, useRedirectionHosts };
