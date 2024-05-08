import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
	createCertificate,
	getCertificate,
	setCertificate,
	Certificate,
} from "src/api/npm";

const fetchCertificate = (id: any) => {
	return getCertificate(id);
};

const useCertificate = (id: number, options = {}) => {
	return useQuery<Certificate, Error>({
		queryKey: ["certificate", id],
		queryFn: () => fetchCertificate(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetCertificate = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: Certificate) => {
			return values.id
				? setCertificate(values.id, values)
				: createCertificate(values);
		},
		onMutate: (values: Certificate) => {
			const previousObject = queryClient.getQueryData([
				"certificate",
				values.id,
			]);

			queryClient.setQueryData(["certificate", values.id], (old: any) => ({
				...old,
				...values,
			}));

			return () =>
				queryClient.setQueryData(["certificate", values.id], previousObject);
		},
		onError: (_, __, rollback: any) => rollback(),
		onSuccess: async ({ id }: Certificate) => {
			queryClient.invalidateQueries({ queryKey: ["certificate", id] });
			queryClient.invalidateQueries({ queryKey: ["certificates"] });
		},
	});
};

export { useCertificate, useSetCertificate };
