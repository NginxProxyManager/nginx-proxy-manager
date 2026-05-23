import { useQuery } from "@tanstack/react-query";
import { getStreams, type HostExpansion, type Stream } from "src/api/backend";

const fetchStreams = (expand?: HostExpansion[]) => {
	return getStreams(expand);
};

const useStreams = (expand?: HostExpansion[], options = {}) => {
	return useQuery<Stream[], Error>({
		queryKey: ["streams", { expand }],
		queryFn: () => fetchStreams(expand),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchStreams, useStreams };
