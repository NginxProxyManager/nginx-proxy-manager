import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type UpstreamHost,
	type UpstreamHostExpansion,
	createUpstreamHost,
	getUpstreamHost,
	updateUpstreamHost,
} from "src/api/backend";

const fetchUpstreamHost = (id: number | "new", expand: UpstreamHostExpansion[] = ["owner", "servers"]) => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			name: "",
			forwardScheme: "http",
			method: "round_robin",
			meta: {},
			servers: [],
		} as UpstreamHost);
	}
	return getUpstreamHost(id, expand);
};

const useUpstreamHost = (id: number | "new", expand?: UpstreamHostExpansion[], options = {}) => {
	return useQuery<UpstreamHost, Error>({
		queryKey: ["upstream-host", id, expand],
		queryFn: () => fetchUpstreamHost(id, expand),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetUpstreamHost = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: UpstreamHost) => (values.id ? updateUpstreamHost(values) : createUpstreamHost(values)),
		onMutate: (values: UpstreamHost) => {
			if (!values.id) {
				return;
			}
			const previousObject = queryClient.getQueryData(["upstream-host", values.id]);
			queryClient.setQueryData(["upstream-host", values.id], (old: UpstreamHost) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData(["upstream-host", values.id], previousObject);
		},
		onError: (_, __, rollback: any) => rollback(),
		onSuccess: async ({ id }: UpstreamHost) => {
			queryClient.invalidateQueries({ queryKey: ["upstream-host", id] });
			queryClient.invalidateQueries({ queryKey: ["upstream-hosts"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		},
	});
};

export { useUpstreamHost, useSetUpstreamHost };
