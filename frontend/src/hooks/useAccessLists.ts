import { useQuery } from "@tanstack/react-query";
import { type AccessList, type AccessListExpansion, getAccessLists } from "src/api/backend";

const fetchAccessLists = (expand?: AccessListExpansion[]) => {
	return getAccessLists(expand);
};

const useAccessLists = (expand?: AccessListExpansion[], options = {}) => {
	return useQuery<AccessList[], Error>({
		queryKey: ["access-lists", { expand }],
		queryFn: () => fetchAccessLists(expand),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchAccessLists, useAccessLists };
