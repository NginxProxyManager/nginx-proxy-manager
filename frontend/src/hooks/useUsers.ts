import { useQuery } from "@tanstack/react-query";
import { getUsers, type User, type UserExpansion } from "src/api/backend";

const fetchUsers = (expand?: UserExpansion[]) => {
	return getUsers(expand);
};

const useUsers = (expand?: UserExpansion[], options = {}) => {
	return useQuery<User[], Error>({
		queryKey: ["users", { expand }],
		queryFn: () => fetchUsers(expand),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchUsers, useUsers };
