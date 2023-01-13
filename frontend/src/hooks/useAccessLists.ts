import {
	getAccessLists,
	AccessListsResponse,
	tableSortToAPI,
	tableFiltersToAPI,
} from "api/npm";
import { useQuery } from "react-query";

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
	return useQuery<AccessListsResponse, Error>(
		["access-lists", { offset, limit, sortBy, filters }],
		() => fetchAccessLists(offset, limit, sortBy, filters),
		{
			keepPreviousData: true,
			staleTime: 15 * 1000, // 15 seconds
			...options,
		},
	);
};

export { useAccessLists };
