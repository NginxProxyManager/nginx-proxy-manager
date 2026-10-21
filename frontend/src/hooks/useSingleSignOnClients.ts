import { useQuery } from "@tanstack/react-query";
import { getSingleSignOnClients, type SingleSignOnClient, type SingleSignOnConfigExpansion } from "src/api/backend";

const fetchSingleSignOnClients = (expand?: SingleSignOnConfigExpansion[]) => {
	return getSingleSignOnClients(expand);
};

const useSingleSignOnClients = (expand?: SingleSignOnConfigExpansion[], options = {}) => {
	return useQuery<SingleSignOnClient[], Error>({
		queryKey: ["sso-clients", { expand }],
		queryFn: () => fetchSingleSignOnClients(expand),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchSingleSignOnClients, useSingleSignOnClients };
