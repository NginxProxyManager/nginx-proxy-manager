import { getUser, setUser, User } from "api/npm";
import { useMutation, useQuery, useQueryClient } from "react-query";

const fetchUser = (id: any) => {
	return getUser(id, { expand: "capabilities" });
};

const useUser = (id: string | number, options = {}) => {
	return useQuery<User, Error>(["user", id], () => fetchUser(id), {
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetUser = () => {
	const queryClient = useQueryClient();
	return useMutation((values: User) => setUser(values.id, values), {
		onMutate: (values) => {
			const previousObject = queryClient.getQueryData(["user", values.id]);

			queryClient.setQueryData(["user", values.id], (old: any) => ({
				...old,
				...values,
			}));

			return () =>
				queryClient.setQueryData(["user", values.id], previousObject);
		},
		onError: (error, values, rollback: any) => rollback(),
		onSuccess: async ({ id }: User) => {
			queryClient.invalidateQueries(["user", id]);
			queryClient.invalidateQueries("users");
		},
	});
};

export { useUser, useSetUser };
