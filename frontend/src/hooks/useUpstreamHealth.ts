import { useQuery } from "@tanstack/react-query";
import { getUpstreamHealth, isApiError, type UpstreamHealth } from "src/api/backend";

/**
 * Resolves to null when health information is unavailable to this user
 * (403), or the backend doesn't have the endpoint (404). Status columns then
 * just don't show health problems.
 */
const fetchUpstreamHealth = async (): Promise<UpstreamHealth | null> => {
	try {
		return await getUpstreamHealth();
	} catch (err) {
		if (isApiError(err) && (err.status === 403 || err.status === 404)) {
			return null;
		}
		throw err;
	}
};

const useUpstreamHealth = (options = {}) => {
	return useQuery<UpstreamHealth | null, Error>({
		queryKey: ["upstream-health"],
		queryFn: fetchUpstreamHealth,
		refetchOnWindowFocus: false,
		// null means 403/404: asking again every 30s would only produce the same
		// answer (and an error log line on the server), so stop polling and don't
		// refetch on mount either until a reload.
		refetchInterval: (query) => (query.state.data === null ? false : 30 * 1000),
		staleTime: (query) => (query.state.data === null ? Number.POSITIVE_INFINITY : 29 * 1000),
		retry: 1,
		...options,
	});
};

export { fetchUpstreamHealth, useUpstreamHealth };
