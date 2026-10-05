import { useQuery } from "@tanstack/react-query";
import { getLogSources, type LogSources } from "src/api/backend";

const fetchLogSources = () => getLogSources();

const useLogSources = (options = {}) => {
	return useQuery<LogSources, Error>({
		queryKey: ["log-sources"],
		queryFn: fetchLogSources,
		staleTime: 30 * 1000,
		...options,
	});
};

export { fetchLogSources, useLogSources };
