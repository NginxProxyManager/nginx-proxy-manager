import { DNSProvidersAcmesh, getDNSProvidersAcmesh } from "api/npm";
import { useQuery } from "react-query";

const useDNSProvidersAcmesh = (options = {}) => {
	return useQuery<DNSProvidersAcmesh[], Error>(
		["dns-providers-acmesh"],
		() => getDNSProvidersAcmesh(),
		{
			keepPreviousData: true,
			staleTime: 60 * 60 * 1000, // 1 hour
			...options,
		},
	);
};

export { useDNSProvidersAcmesh };
