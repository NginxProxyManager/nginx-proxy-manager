import {
	createCertificateAuthority,
	getCertificateAuthority,
	setCertificateAuthority,
	CertificateAuthority,
} from "api/npm";
import { useMutation, useQuery, useQueryClient } from "react-query";

const fetchCertificateAuthority = (id: any) => {
	return getCertificateAuthority(id);
};

const useCertificateAuthority = (id: number, options = {}) => {
	return useQuery<CertificateAuthority, Error>(
		["certificate-authority", id],
		() => fetchCertificateAuthority(id),
		{
			staleTime: 60 * 1000, // 1 minute
			...options,
		},
	);
};

const useSetCertificateAuthority = () => {
	const queryClient = useQueryClient();
	return useMutation(
		(values: CertificateAuthority) => {
			return values.id
				? setCertificateAuthority(values.id, values)
				: createCertificateAuthority(values);
		},
		{
			onMutate: (values) => {
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
			onError: (error, values, rollback: any) => rollback(),
			onSuccess: async ({ id }: CertificateAuthority) => {
				queryClient.invalidateQueries(["certificate-authority", id]);
				queryClient.invalidateQueries("certificate-authorities");
			},
		},
	);
};

export { useCertificateAuthority, useSetCertificateAuthority };
