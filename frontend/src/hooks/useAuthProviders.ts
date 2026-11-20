import { useQuery } from "@tanstack/react-query";
import { type AuthProvider, getAuthProviders } from "src/api/backend";

const useAuthProviders = (options = {}) => {
	return useQuery<AuthProvider[], Error>({
		queryKey: ["auth-providers"],
		queryFn: getAuthProviders,
		staleTime: 60 * 1000,
		...options,
	});
};

export { useAuthProviders };
