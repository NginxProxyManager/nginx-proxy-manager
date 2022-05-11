import { getHealth, HealthResponse } from "api/npm";
import { useQuery } from "react-query";

const fetchHealth = () => getHealth();

const useHealth = (options = {}) => {
	return useQuery<HealthResponse, Error>("health", fetchHealth, {
		refetchOnWindowFocus: false,
		retry: 5,
		refetchInterval: 15 * 1000, // 15 seconds
		staleTime: 14 * 1000, // 14 seconds
		...options,
	});
};

export { fetchHealth, useHealth };
