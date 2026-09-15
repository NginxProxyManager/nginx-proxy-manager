import { useQuery } from "@tanstack/react-query";
import { getLocalAuth } from "src/api/backend";

const useLocalAuth = (options = {}) => {
	return useQuery<{ localEnabled: boolean }, Error>({
		queryKey: ["auth-local"],
		queryFn: getLocalAuth,
		staleTime: 60 * 1000,
		...options,
	});
};

export { useLocalAuth };
