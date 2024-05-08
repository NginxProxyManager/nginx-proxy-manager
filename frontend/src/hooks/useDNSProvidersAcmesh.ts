import { useQuery } from "@tanstack/react-query";

import { DNSProvidersAcmesh, getDNSProvidersAcmesh } from "src/api/npm";

const useDNSProvidersAcmesh = (options = {}) => {
	return useQuery<DNSProvidersAcmesh[], Error>({
		queryKey: ["dns-providers-acmesh"],
		queryFn: () => getDNSProvidersAcmesh(),
		staleTime: 60 * 60 * 1000, // 1 hour
		...options,
	});
};

export { useDNSProvidersAcmesh };
