import {
	getNginxTemplates,
	NginxTemplatesResponse,
	tableSortToAPI,
	tableFiltersToAPI,
} from "api/npm";
import { useQuery } from "react-query";

const fetchNginxTemplates = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
) => {
	return getNginxTemplates(
		offset,
		limit,
		tableSortToAPI(sortBy),
		tableFiltersToAPI(filters),
	);
};

const useNginxTemplates = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
	options = {},
) => {
	return useQuery<NginxTemplatesResponse, Error>(
		["nginx-templates", { offset, limit, sortBy, filters }],
		() => fetchNginxTemplates(offset, limit, sortBy, filters),
		{
			keepPreviousData: true,
			staleTime: 15 * 1000, // 15 seconds
			...options,
		},
	);
};

export { fetchNginxTemplates, useNginxTemplates };
