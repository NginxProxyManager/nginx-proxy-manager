import { useQuery } from "@tanstack/react-query";
import { getHostsReport } from "src/api/backend";

const fetchHostReport = () => getHostsReport();

const useHostReport = (options = {}) => {
	return useQuery<Record<string, number>, Error>({
		queryKey: ["host-report"],
		queryFn: fetchHostReport,
		refetchOnWindowFocus: false,
		retry: 5,
		refetchInterval: 15 * 1000, // 15 seconds
		staleTime: 14 * 1000, // 14 seconds
		...options,
	});
};

export { fetchHostReport, useHostReport };
