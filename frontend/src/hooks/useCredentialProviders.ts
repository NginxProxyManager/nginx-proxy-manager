import { useQuery } from "@tanstack/react-query";
import { getCredentialProviders } from "src/api/backend/getCredentialProviders";

export function useCredentialProviders() {
	return useQuery({
		queryKey: ["credential-providers"],
		queryFn: getCredentialProviders,
	});
}
