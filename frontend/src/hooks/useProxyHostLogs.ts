import { useQuery } from "@tanstack/react-query";
import { getProxyHostLogs } from "src/api/backend";

const useProxyHostLogs = (id: number, type: "access" | "error" = "access") => {
	return useQuery<{ logs: string }, Error>({
		queryKey: ["proxy-host-logs", id, type],
		queryFn: () => getProxyHostLogs(id, type),
		staleTime: 10_000,
	});
};

export { useProxyHostLogs };
