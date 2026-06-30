import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOidcConfig, updateOidcConfig, type OidcConfig } from "src/api/backend";

const useOidcConfig = (options = {}) => {
	return useQuery<OidcConfig, Error>({
		queryKey: ["oidc-config"],
		queryFn: () => getOidcConfig(),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetOidcConfig = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: OidcConfig) => updateOidcConfig(values),
		onSuccess: async () => {
			queryClient.invalidateQueries({ queryKey: ["oidc-config"] });
			queryClient.invalidateQueries({ queryKey: ["oidc-providers"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
};

export { useOidcConfig, useSetOidcConfig };
