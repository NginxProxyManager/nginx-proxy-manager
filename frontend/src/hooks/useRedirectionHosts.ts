import { useQuery } from "@tanstack/react-query";
import { getRedirectionHosts, type RedirectionHost, type RedirectionHostExpansion } from "src/api/backend";

const fetchRedirectionHosts = (expand?: RedirectionHostExpansion[]) => {
	return getRedirectionHosts(expand);
};

const useRedirectionHosts = (expand?: RedirectionHostExpansion[], options = {}) => {
	return useQuery<RedirectionHost[], Error>({
		queryKey: ["redirection-hosts", { expand }],
		queryFn: () => fetchRedirectionHosts(expand),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchRedirectionHosts, useRedirectionHosts };
