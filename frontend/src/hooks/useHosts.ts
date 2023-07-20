import { useQuery } from "@tanstack/react-query";

import {
	getHosts,
	HostsResponse,
	tableSortToAPI,
	tableFiltersToAPI,
} from "src/api/npm";

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
	return useQuery<HostsResponse, Error>({
		queryKey: ["hosts", { offset, limit, sortBy, filters }],
		queryFn: () => fetchHosts(offset, limit, sortBy, filters),
		keepPreviousData: true,
		staleTime: 15 * 1000, // 15 seconds
		...options,
	});
};

export { fetchHosts, useHosts };
