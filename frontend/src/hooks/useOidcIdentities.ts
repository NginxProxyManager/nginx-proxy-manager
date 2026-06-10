import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	getOidcIdentities,
	unlinkOidcIdentity,
	type OidcIdentity,
} from "src/api/backend";

const useOidcIdentities = (options = {}) => {
	return useQuery<OidcIdentity[], Error>({
		queryKey: ["oidc-identities"],
		queryFn: () => getOidcIdentities(),
		staleTime: 60 * 1000,
		...options,
	});
};

const useUnlinkOidcIdentity = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (providerId: string) => unlinkOidcIdentity(providerId),
		onSuccess: async () => {
			queryClient.invalidateQueries({ queryKey: ["oidc-identities"] });
			queryClient.invalidateQueries({ queryKey: ["user", "me"] });
		},
	});
};

export { useOidcIdentities, useUnlinkOidcIdentity };
