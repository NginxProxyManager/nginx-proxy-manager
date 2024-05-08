import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
	createCertificateAuthority,
	getCertificateAuthority,
	setCertificateAuthority,
	CertificateAuthority,
} from "src/api/npm";

const fetchCertificateAuthority = (id: any) => {
	return getCertificateAuthority(id);
};

const useCertificateAuthority = (id: number, options = {}) => {
	return useQuery<CertificateAuthority, Error>({
		queryKey: ["certificate-authority", id],
		queryFn: () => fetchCertificateAuthority(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetCertificateAuthority = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: CertificateAuthority) => {
			return values.id
				? setCertificateAuthority(values.id, values)
				: createCertificateAuthority(values);
		},
		onMutate: (values: CertificateAuthority) => {
			const previousObject = queryClient.getQueryData([
				"certificate-authority",
				values.id,
			]);

			queryClient.setQueryData(
				["certificate-authority", values.id],
				(old: any) => ({
					...old,
					...values,
				}),
			);

			return () =>
				queryClient.setQueryData(
					["certificate-authority", values.id],
					previousObject,
				);
		},
		onError: (_: any, __: any, rollback: any) => rollback(),
		onSuccess: async ({ id }: CertificateAuthority) => {
			queryClient.invalidateQueries({
				queryKey: ["certificate-authority", id],
			});
			queryClient.invalidateQueries({
				queryKey: ["certificate-authorities"],
			});
		},
	});
};

export { useCertificateAuthority, useSetCertificateAuthority };
