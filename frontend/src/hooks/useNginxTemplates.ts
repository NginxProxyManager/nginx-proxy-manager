import { useQuery } from "@tanstack/react-query";

import {
	getNginxTemplates,
	NginxTemplatesResponse,
	tableSortToAPI,
	tableFiltersToAPI,
} from "src/api/npm";

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
	return useQuery<NginxTemplatesResponse, Error>({
		queryKey: ["nginx-templates", { offset, limit, sortBy, filters }],
		queryFn: () => fetchNginxTemplates(offset, limit, sortBy, filters),
		staleTime: 15 * 1000, // 15 seconds
		...options,
	});
};

export { fetchNginxTemplates, useNginxTemplates };
