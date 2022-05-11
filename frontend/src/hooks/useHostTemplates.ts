import {
	getHostTemplates,
	HostTemplatesResponse,
	tableSortToAPI,
	tableFiltersToAPI,
} from "api/npm";
import { useQuery } from "react-query";

const fetchHostTemplates = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
) => {
	return getHostTemplates(
		offset,
		limit,
		tableSortToAPI(sortBy),
		tableFiltersToAPI(filters),
	);
};

const useHostTemplates = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
	options = {},
) => {
	return useQuery<HostTemplatesResponse, Error>(
		["hosts", { offset, limit, sortBy, filters }],
		() => fetchHostTemplates(offset, limit, sortBy, filters),
		{
			keepPreviousData: true,
			staleTime: 15 * 1000, // 15 seconds
			...options,
		},
	);
};

export { fetchHostTemplates, useHostTemplates };
