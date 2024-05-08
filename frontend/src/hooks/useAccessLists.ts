import { useQuery } from "@tanstack/react-query";

import {
	getAccessLists,
	AccessListsResponse,
	tableSortToAPI,
	tableFiltersToAPI,
} from "src/api/npm";

const fetchAccessLists = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
) => {
	return getAccessLists(
		offset,
		limit,
		tableSortToAPI(sortBy),
		tableFiltersToAPI(filters),
	);
};

const useAccessLists = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
	options = {},
) => {
	return useQuery<AccessListsResponse, Error>({
		queryKey: ["access-lists", { offset, limit, sortBy, filters }],
		queryFn: () => fetchAccessLists(offset, limit, sortBy, filters),
		staleTime: 15 * 1000, // 15 seconds
		...options,
	});
};

export { useAccessLists };
