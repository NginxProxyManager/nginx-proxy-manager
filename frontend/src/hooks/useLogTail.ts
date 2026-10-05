import { useQuery } from "@tanstack/react-query";
import { type GetLogTailParams, getLogTail, type LogTail } from "src/api/backend";

const POLL_INTERVAL_MS = 5000;

interface UseLogTailOptions extends GetLogTailParams {
	live?: boolean;
}

// Polls for new log lines while `live` is true. React Query only runs the interval
// while the tab is focused (refetchIntervalInBackground defaults to false), so an
// idle/backgrounded browser tab never generates load.
const useLogTail = ({ live = true, ...params }: UseLogTailOptions) => {
	const enabled = params.type === "host" ? Boolean(params.hostType && params.hostId && params.channel) : true;

	return useQuery<LogTail, Error>({
		queryKey: ["log-tail", params],
		queryFn: () => getLogTail(params),
		enabled,
		refetchInterval: live ? POLL_INTERVAL_MS : false,
		placeholderData: (previousData) => previousData,
	});
};

export { useLogTail };
