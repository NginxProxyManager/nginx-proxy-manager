import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProxyHost, getProxyHost, type ProxyHost, updateProxyHost } from "src/api/backend";

const paramsForAgent = (agentId?: string) => (agentId && agentId !== "local" ? { agent_id: agentId } : {});

const fetchProxyHost = (id: number | "new", agentId?: string) => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			domainNames: [],
			forwardHost: "",
			forwardPort: 0,
			accessListId: 0,
			certificateId: 0,
			sslForced: false,
			cachingEnabled: false,
			blockExploits: false,
			advancedConfig: "",
			meta: {},
			allowWebsocketUpgrade: false,
			http2Support: false,
			forwardScheme: "",
			enabled: true,
			hstsEnabled: false,
			hstsSubdomains: false,
			trustForwardedProto: false,
		} as ProxyHost);
	}
	return getProxyHost(id, ["owner"], paramsForAgent(agentId));
};

const useProxyHost = (id: number | "new", options: any = {}, agentId?: string) => {
	return useQuery<ProxyHost, Error>({
		queryKey: ["proxy-host", id, { agentId }],
		queryFn: () => fetchProxyHost(id, agentId),
		staleTime: 60 * 1000,
		...options,
	});
};

const useSetProxyHost = (agentId?: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: ProxyHost) => {
			const payload = { ...values, agentId } as ProxyHost & { agentId?: string };
			return values.id ? updateProxyHost(payload) : createProxyHost(payload);
		},
		onMutate: (values: ProxyHost) => {
			if (!values.id) {
				return;
			}
			const previousObject = queryClient.getQueryData(["proxy-host", values.id, { agentId }]);
			queryClient.setQueryData(["proxy-host", values.id, { agentId }], (old: ProxyHost) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData(["proxy-host", values.id, { agentId }], previousObject);
		},
		onError: (_, __, rollback: any) => rollback(),
		onSuccess: async ({ id }: ProxyHost) => {
			queryClient.invalidateQueries({ queryKey: ["proxy-host", id] });
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
			queryClient.invalidateQueries({ queryKey: ["host-report"] });
			queryClient.invalidateQueries({ queryKey: ["certificates"] });
		},
	});
};

export { useProxyHost, useSetProxyHost };
