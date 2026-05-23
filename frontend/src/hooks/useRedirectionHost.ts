import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createRedirectionHost,
	getRedirectionHost,
	type RedirectionHost,
	updateRedirectionHost,
} from "src/api/backend";

const fetchRedirectionHost = (id: number | "new") => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			domainNames: [],
			forwardDomainName: "",
			preservePath: false,
			certificateId: 0,
			sslForced: false,
			advancedConfig: "",
			meta: {},
			http2Support: false,
			forwardScheme: "auto",
			forwardHttpCode: 301,
			blockExploits: false,
			enabled: true,
			hstsEnabled: false,
			hstsSubdomains: false,
		} as RedirectionHost);
	}
	return getRedirectionHost(id, ["owner"]);
};

const useRedirectionHost = (id: number | "new", options = {}) => {
	return useQuery<RedirectionHost, Error>({
		queryKey: ["redirection-host", id],
		queryFn: () => fetchRedirectionHost(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetRedirectionHost = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: RedirectionHost) =>
			values.id ? updateRedirectionHost(values) : createRedirectionHost(values),
		onMutate: (values: RedirectionHost) => {
			if (!values.id) {
				return;
			}
			const previousObject = queryClient.getQueryData(["redirection-host", values.id]);
			queryClient.setQueryData(["redirection-host", values.id], (old: RedirectionHost) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData(["redirection-host", values.id], previousObject);
		},
		onError: (_, __, rollback: any) => rollback(),
		onSuccess: async ({ id }: RedirectionHost) => {
			queryClient.invalidateQueries({ queryKey: ["redirection-host", id] });
			queryClient.invalidateQueries({ queryKey: ["redirection-hosts"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
			queryClient.invalidateQueries({ queryKey: ["host-report"] });
			queryClient.invalidateQueries({ queryKey: ["certificates"] });
		},
	});
};

export { useRedirectionHost, useSetRedirectionHost };
