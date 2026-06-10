import { useQuery } from "@tanstack/react-query";
import { getOidcProviders, type OidcProvider } from "src/api/backend";

const useOidcProviders = (options = {}) => {
	return useQuery<OidcProvider[], Error>({
		queryKey: ["oidc-providers"],
		queryFn: () => getOidcProviders(),
		staleTime: 5 * 60 * 1000, // 5 minutes — provider config rarely changes
		...options,
	});
};

export { useOidcProviders };
