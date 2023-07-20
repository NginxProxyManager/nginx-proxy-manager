import { useQuery } from "@tanstack/react-query";

import {
	getUsers,
	UsersResponse,
	tableSortToAPI,
	tableFiltersToAPI,
} from "src/api/npm";

const fetchUsers = (offset = 0, limit = 10, sortBy?: any, filters?: any) => {
	return getUsers(
		offset,
		limit,
		tableSortToAPI(sortBy),
		tableFiltersToAPI(filters),
	);
};

const useUsers = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
	options = {},
) => {
	return useQuery<UsersResponse, Error>({
		queryKey: ["users", { offset, limit, sortBy, filters }],
		queryFn: () => fetchUsers(offset, limit, sortBy, filters),
		keepPreviousData: true,
		staleTime: 15 * 1000, // 15 seconds
		...options,
	});
};

export { fetchUsers, useUsers };
