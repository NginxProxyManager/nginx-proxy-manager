import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getUser, setUser, User } from "src/api/npm";

const fetchUser = (id: any) => {
	return getUser(id, { expand: "capabilities" });
};

const useUser = (id: string | number, options = {}) => {
	return useQuery<User, Error>({
		queryKey: ["user", id],
		queryFn: () => fetchUser(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetUser = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: User) => setUser(values.id, values),
		onMutate: (values) => {
			const previousObject = queryClient.getQueryData(["user", values.id]);

			queryClient.setQueryData(["user", values.id], (old: any) => ({
				...old,
				...values,
			}));

			return () =>
				queryClient.setQueryData(["user", values.id], previousObject);
		},
		onError: (_, __, rollback: any) => rollback(),
		onSuccess: async ({ id }: User) => {
			queryClient.invalidateQueries({ queryKey: ["user", id] });
			queryClient.invalidateQueries({ queryKey: ["users"] });
		},
	});
};

export { useUser, useSetUser };
