import {
	getDNSProviders,
	DNSProvidersResponse,
	tableSortToAPI,
	tableFiltersToAPI,
} from "api/npm";
import { useQuery } from "react-query";

const fetchDNSProviders = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
) => {
	return getDNSProviders(
		offset,
		limit,
		tableSortToAPI(sortBy),
		tableFiltersToAPI(filters),
	);
};

const useDNSProviders = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
	options = {},
) => {
	return useQuery<DNSProvidersResponse, Error>(
		["dns-providers", { offset, limit, sortBy, filters }],
		() => fetchDNSProviders(offset, limit, sortBy, filters),
		{
			keepPreviousData: true,
			staleTime: 15 * 1000, // 15 seconds
			...options,
		},
	);
};

export { useDNSProviders };
