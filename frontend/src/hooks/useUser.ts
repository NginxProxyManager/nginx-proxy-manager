import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, getUser, type User, updateUser } from "src/api/backend";

const paramsForAgent = (agentId?: string) => (agentId && agentId !== "local" ? { agent_id: agentId } : {});

const fetchUser = (id: number | string, agentId?: string) => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			isDisabled: false,
			email: "",
			name: "",
			nickname: "",
			roles: [],
			avatar: "",
		} as User);
	}
	return getUser(id, ["permissions"], paramsForAgent(agentId));
};

const useUser = (id: string | number, options = {}, agentId?: string) => {
	return useQuery<User, Error>({
		queryKey: ["user", id, { agentId }],
		queryFn: () => fetchUser(id, agentId),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetUser = (agentId?: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: User) => (values.id ? updateUser(values, agentId) : createUser(values, false, agentId)),
		onMutate: (values: User) => {
			if (!values.id) {
				return;
			}
			const previousObject = queryClient.getQueryData(["user", values.id, { agentId }]);
			queryClient.setQueryData(["user", values.id, { agentId }], (old: User) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData(["user", values.id, { agentId }], previousObject);
		},
		onError: (_, __, rollback: any) => rollback(),
		onSuccess: async ({ id }: User) => {
			queryClient.invalidateQueries({ queryKey: ["user", id] });
			queryClient.invalidateQueries({ queryKey: ["users"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
};

export { useUser, useSetUser };
