import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProxyHost, getProxyHost, type ProxyHost, updateProxyHost } from "src/api/backend";

const fetchProxyHost = (id: number | "new") => {
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
	return getProxyHost(id, ["owner"]);
};

const useProxyHost = (id: number | "new", options = {}) => {
	return useQuery<ProxyHost, Error>({
		queryKey: ["proxy-host", id],
		queryFn: () => fetchProxyHost(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetProxyHost = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: ProxyHost) => (values.id ? updateProxyHost(values) : createProxyHost(values)),
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
