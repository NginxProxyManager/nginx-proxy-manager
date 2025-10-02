import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AccessList, createAccessList, getAccessList, updateAccessList } from "src/api/backend";

const fetchAccessList = (id: number | "new") => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			name: "",
			satisfyAny: false,
			passAuth: false,
			meta: {},
		} as AccessList);
	}
	return getAccessList(id, ["owner"]);
};

const useAccessList = (id: number | "new", options = {}) => {
	return useQuery<AccessList, Error>({
		queryKey: ["access-list", id],
		queryFn: () => fetchAccessList(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetAccessList = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: AccessList) => (values.id ? updateAccessList(values) : createAccessList(values)),
		onMutate: (values: AccessList) => {
			if (!values.id) {
				return;
			}
			const previousObject = queryClient.getQueryData(["access-list", values.id]);
			queryClient.setQueryData(["access-list", values.id], (old: AccessList) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData(["access-list", values.id], previousObject);
		},
		onError: (_, __, rollback: any) => rollback(),
		onSuccess: async ({ id }: AccessList) => {
			queryClient.invalidateQueries({ queryKey: ["access-list", id] });
			queryClient.invalidateQueries({ queryKey: ["access-list"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
};

export { useAccessList, useSetAccessList };
