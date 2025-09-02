import { useQuery } from "@tanstack/react-query";
import { getStreams, type Stream, type StreamExpansion } from "src/api/backend";

const fetchStreams = (expand?: StreamExpansion[]) => {
	return getStreams(expand);
};

const useStreams = (expand?: StreamExpansion[], options = {}) => {
	return useQuery<Stream[], Error>({
		queryKey: ["streams", { expand }],
		queryFn: () => fetchStreams(expand),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchStreams, useStreams };
