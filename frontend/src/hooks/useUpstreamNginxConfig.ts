import { getUpstreamNginxConfig } from "api/npm";
import { useQuery } from "react-query";

const fetchUpstreamNginxConfig = (id: any) => {
	return getUpstreamNginxConfig(id);
};

const useUpstreamNginxConfig = (id: number, options = {}) => {
	return useQuery<string, Error>(
		["upstream-nginx-config", id],
		() => fetchUpstreamNginxConfig(id),
		{
			staleTime: 30 * 1000, // 30 seconds
			...options,
		},
	);
};

export { useUpstreamNginxConfig };
