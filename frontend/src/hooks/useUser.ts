import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, getUser, type NewUser, type User, type UserUpdate, updateUser } from "src/api/backend";

const fetchUser = (id: number | string) => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			isDisabled: false,
			email: "",
			name: "",
			capabilities: [],
			passwordLoginEnabled: false,
			hasLocalCredential: false,
			canSetLocalPassword: true,
			gravatarUrl: "",
		} as User);
	}
	return getUser(id);
};

const useCurrentUser = (options = {}) => useUser("me", options);

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
		mutationFn: (values: UserUpdate | NewUser) => {
			if ("id" in values && typeof values.id === "number") return updateUser(values);
			return createUser(values as NewUser);
		},
		onMutate: (values: UserUpdate | NewUser) => {
			if (!("id" in values) || !values.id) {
				return;
			}
			const previousObject = queryClient.getQueryData(["user", values.id]);
			queryClient.setQueryData(["user", values.id], (old: User) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData(["user", values.id], previousObject);
		},
		onError: (_, __, rollback: any) => rollback(),
		onSuccess: async ({ id }: User) => {
			queryClient.invalidateQueries({ queryKey: ["user", id] });
			queryClient.invalidateQueries({ queryKey: ["users"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
};

export { useCurrentUser, useSetUser, useUser };
