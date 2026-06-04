import { useQuery } from "@tanstack/react-query";
import { getCredentials } from "src/api/backend/getCredentials";

export function useCredentials() {
	return useQuery({
		queryKey: ["credentials"],
		queryFn: getCredentials,
	});
}
