import { useQuery } from "@tanstack/react-query";
import { checkVersion, type VersionCheckResponse } from "src/api/backend";

const fetchVersion = () => checkVersion();

const useCheckVersion = (options = {}) => {
	return useQuery<VersionCheckResponse, Error>({
		queryKey: ["version-check"],
		queryFn: fetchVersion,
		refetchOnWindowFocus: false,
		retry: 5,
		refetchInterval: 30 * 1000, // 30 seconds
		staleTime: 5 * 60 * 1000, // 5 mins
		...options,
	});
};

export { fetchVersion, useCheckVersion };
