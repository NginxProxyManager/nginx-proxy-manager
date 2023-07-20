import { useQuery } from "@tanstack/react-query";

import { getUpstreamNginxConfig } from "src/api/npm";

const fetchUpstreamNginxConfig = (id: any) => {
	return getUpstreamNginxConfig(id);
};

const useUpstreamNginxConfig = (id: number, options = {}) => {
	return useQuery<string, Error>({
		queryKey: ["upstream-nginx-config", id],
		queryFn: () => fetchUpstreamNginxConfig(id),
		staleTime: 30 * 1000, // 30 seconds
		...options,
	});
};

export { useUpstreamNginxConfig };
