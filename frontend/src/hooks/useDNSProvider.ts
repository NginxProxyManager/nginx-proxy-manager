import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
	createDNSProvider,
	getDNSProvider,
	setDNSProvider,
	DNSProvider,
} from "src/api/npm";

const fetchDNSProvider = (id: any) => {
	return getDNSProvider(id);
};

const useDNSProvider = (id: number, options = {}) => {
	return useQuery<DNSProvider, Error>({
		queryKey: ["dns-provider", id],
		queryFn: () => fetchDNSProvider(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetDNSProvider = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: DNSProvider) => {
			return values.id
				? setDNSProvider(values.id, values)
				: createDNSProvider(values);
		},
		onMutate: (values: DNSProvider) => {
			const previousObject = queryClient.getQueryData([
				"dns-provider",
				values.id,
			]);

			queryClient.setQueryData(["dns-provider", values.id], (old: any) => ({
				...old,
				...values,
			}));

			return () =>
				queryClient.setQueryData(["dns-provider", values.id], previousObject);
		},
		onError: (_, __, rollback: any) => rollback(),
		onSuccess: async ({ id }: DNSProvider) => {
			queryClient.invalidateQueries({ queryKey: ["dns-provider", id] });
			queryClient.invalidateQueries({ queryKey: ["dns-providers"] });
		},
	});
};

export { useDNSProvider, useSetDNSProvider };
