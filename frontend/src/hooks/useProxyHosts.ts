import { useQuery } from "@tanstack/react-query";
import { getProxyHosts, type ProxyHost, type ProxyHostExpansion } from "src/api/backend";

const fetchProxyHosts = (expand?: ProxyHostExpansion[], agentId?: string) => {
	return getProxyHosts(expand, agentId && agentId !== "local" ? { agent_id: agentId } : {});
};

const useProxyHosts = (expand?: ProxyHostExpansion[], options: any = {}, agentId?: string) => {
	return useQuery<ProxyHost[], Error>({
		queryKey: ["proxy-hosts", { expand, agentId }],
		queryFn: () => fetchProxyHosts(expand, agentId),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchProxyHosts, useProxyHosts };
