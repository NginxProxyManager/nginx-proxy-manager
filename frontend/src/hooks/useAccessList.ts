import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type AccessList,
	type AccessListExpansion,
	createAccessList,
	createAccessListKeyInvite,
	createAccessListToken,
	deleteAccessListKey,
	deleteAccessListToken,
	getAccessList,
	type NewAccessListToken,
	renameAccessListKey,
	updateAccessList,
	updateAccessListToken,
} from "src/api/backend";

const fetchAccessList = (id: number | "new", expand: AccessListExpansion[] = ["owner"]) => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			name: "",
			satisfyAny: false,
			passAuth: false,
			keyAuth: false,
			keySessionHours: 168,
			meta: {},
		} as AccessList);
	}
	return getAccessList(id, expand);
};

const useAccessList = (id: number | "new", expand?: AccessListExpansion[], options = {}) => {
	return useQuery<AccessList, Error>({
		queryKey: ["access-list", id, expand],
		queryFn: () => fetchAccessList(id, expand),
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
			queryClient.invalidateQueries({ queryKey: ["access-lists"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		},
	});
};

// Keys and tokens are saved straight away, outside the access list form
const invalidateAccessList = (queryClient: QueryClient, listId: number) => {
	queryClient.invalidateQueries({ queryKey: ["access-list", listId] });
	queryClient.invalidateQueries({ queryKey: ["access-lists"] });
	queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
};

const useCreateAccessListKeyInvite = (listId: number) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (name: string) => createAccessListKeyInvite(listId, name),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["audit-logs"] }),
	});
};

const useRenameAccessListKey = (listId: number) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ keyId, name }: { keyId: number; name: string }) => renameAccessListKey(listId, keyId, name),
		onSuccess: () => invalidateAccessList(queryClient, listId),
	});
};

const useDeleteAccessListKey = (listId: number) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (keyId: number) => deleteAccessListKey(listId, keyId),
		onSuccess: () => invalidateAccessList(queryClient, listId),
	});
};

const useCreateAccessListToken = (listId: number) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (token: NewAccessListToken) => createAccessListToken(listId, token),
		onSuccess: () => {
			invalidateAccessList(queryClient, listId);
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		},
	});
};

const useUpdateAccessListToken = (listId: number) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tokenId, data }: { tokenId: number; data: { name?: string; forward?: boolean } }) =>
			updateAccessListToken(listId, tokenId, data),
		onSuccess: () => {
			invalidateAccessList(queryClient, listId);
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		},
	});
};

const useDeleteAccessListToken = (listId: number) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (tokenId: number) => deleteAccessListToken(listId, tokenId),
		onSuccess: () => {
			invalidateAccessList(queryClient, listId);
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		},
	});
};

export {
	useAccessList,
	useCreateAccessListKeyInvite,
	useCreateAccessListToken,
	useDeleteAccessListKey,
	useDeleteAccessListToken,
	useRenameAccessListKey,
	useSetAccessList,
	useUpdateAccessListToken,
};
