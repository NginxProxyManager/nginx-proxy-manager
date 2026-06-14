import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDeadHost, type DeadHost, getDeadHost, updateDeadHost } from "src/api/backend";

const fetchDeadHost = (id: number | "new") => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			domainNames: [],
			certificateId: 0,
			sslForced: false,
			advancedConfig: "",
			meta: {},
			http2Support: false,
			enabled: true,
			hstsEnabled: false,
			hstsSubdomains: false,
		} as DeadHost);
	}
	return getDeadHost(id, ["owner"]);
};

const useDeadHost = (id: number | "new", options = {}) => {
	return useQuery<DeadHost, Error>({
		queryKey: ["dead-host", id],
		queryFn: () => fetchDeadHost(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetDeadHost = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: DeadHost) => (values.id ? updateDeadHost(values) : createDeadHost(values)),
		onMutate: (values: DeadHost) => {
			if (!values.id) {
				return;
			}
			const previousObject = queryClient.getQueryData(["dead-host", values.id]);
			queryClient.setQueryData(["dead-host", values.id], (old: DeadHost) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData(["dead-host", values.id], previousObject);
		},
		onError: (_, __, rollback: any) => rollback(),
		onSuccess: async ({ id }: DeadHost) => {
			queryClient.invalidateQueries({ queryKey: ["dead-host", id] });
			queryClient.invalidateQueries({ queryKey: ["dead-hosts"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
			queryClient.invalidateQueries({ queryKey: ["host-report"] });
			queryClient.invalidateQueries({ queryKey: ["certificates"] });
		},
	});
};

export { useDeadHost, useSetDeadHost };
