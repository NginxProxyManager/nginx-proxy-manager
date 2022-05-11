import {
	getUsers,
	UsersResponse,
	tableSortToAPI,
	tableFiltersToAPI,
} from "api/npm";
import { useQuery } from "react-query";

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
	return useQuery<UsersResponse, Error>(
		["users", { offset, limit, sortBy, filters }],
		() => fetchUsers(offset, limit, sortBy, filters),
		{
			keepPreviousData: true,
			staleTime: 15 * 1000, // 15 seconds
			...options,
		},
	);
};

export { fetchUsers, useUsers };
