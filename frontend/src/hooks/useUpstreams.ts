import { useQuery } from "@tanstack/react-query";

import {
	getUpstreams,
	HostsResponse,
	tableSortToAPI,
	tableFiltersToAPI,
} from "src/api/npm";

const fetchUpstreams = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
) => {
	return getUpstreams(
		offset,
		limit,
		tableSortToAPI(sortBy),
		tableFiltersToAPI(filters),
	);
};

const useUpstreams = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
	options = {},
) => {
	return useQuery<HostsResponse, Error>({
		queryKey: ["upstreams", { offset, limit, sortBy, filters }],
		queryFn: () => fetchUpstreams(offset, limit, sortBy, filters),
		keepPreviousData: true,
		staleTime: 15 * 1000, // 15 seconds
		...options,
	});
};

export { fetchUpstreams, useUpstreams };
