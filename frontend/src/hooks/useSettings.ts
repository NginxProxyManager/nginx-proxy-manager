import {
	getSettings,
	SettingsResponse,
	tableSortToAPI,
	tableFiltersToAPI,
} from "api/npm";
import { useQuery } from "react-query";

const fetchSettings = (offset = 0, limit = 10, sortBy?: any, filters?: any) => {
	return getSettings(
		offset,
		limit,
		tableSortToAPI(sortBy),
		tableFiltersToAPI(filters),
	);
};

const useSettings = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
	options = {},
) => {
	return useQuery<SettingsResponse, Error>(
		["settings", { offset, limit, sortBy, filters }],
		() => fetchSettings(offset, limit, sortBy, filters),
		{
			keepPreviousData: true,
			staleTime: 15 * 1000, // 15 seconds
			...options,
		},
	);
};

export { fetchSettings, useSettings };
