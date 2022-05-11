import {
	getHosts,
	HostsResponse,
	tableSortToAPI,
	tableFiltersToAPI,
} from "api/npm";
import { useQuery } from "react-query";

const fetchHosts = (offset = 0, limit = 10, sortBy?: any, filters?: any) => {
	return getHosts(
		offset,
		limit,
		tableSortToAPI(sortBy),
		tableFiltersToAPI(filters),
	);
};

const useHosts = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
	options = {},
) => {
	return useQuery<HostsResponse, Error>(
		["hosts", { offset, limit, sortBy, filters }],
		() => fetchHosts(offset, limit, sortBy, filters),
		{
			keepPreviousData: true,
			staleTime: 15 * 1000, // 15 seconds
			...options,
		},
	);
};

export { fetchHosts, useHosts };
