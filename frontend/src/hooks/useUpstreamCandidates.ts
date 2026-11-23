import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { getUpstreamCandidates, type UpstreamCandidates } from "src/api/backend";

const QUERY_KEY = ["upstream-candidates"];

const fetchUpstreamCandidates = (refresh = false) => getUpstreamCandidates(refresh);

/**
 * Upstream suggestions for the forward host pickers.
 *
 * Only fetches while `enabled` is true (the pickers turn it on once a modal
 * with them is open and the field is used). A failure (e.g. 403 for users
 * without manage permission, or an older backend without the endpoint) is not
 * retried; the pickers then simply behave like plain text inputs.
 */
const useUpstreamCandidates = (enabled: boolean, options = {}) => {
	const queryClient = useQueryClient();
	const [isRefreshing, setIsRefreshing] = useState(false);
	const query = useQuery<UpstreamCandidates, Error>({
		queryKey: QUERY_KEY,
		queryFn: () => fetchUpstreamCandidates(),
		enabled,
		staleTime: 30 * 1000,
		retry: false,
		refetchOnWindowFocus: false,
		...options,
	});

	// Bypasses the server side cache. Rate limited by the backend, so errors are ignored.
	const refresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			const data = await fetchUpstreamCandidates(true);
			queryClient.setQueryData(QUERY_KEY, data);
		} catch {
			// keep the previous suggestions
		} finally {
			setIsRefreshing(false);
		}
	}, [queryClient]);

	return { ...query, refresh, isRefreshing };
};

export { fetchUpstreamCandidates, useUpstreamCandidates };
