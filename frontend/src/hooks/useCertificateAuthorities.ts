import { useQuery } from "@tanstack/react-query";

import {
	CertificateAuthoritiesResponse,
	getCertificateAuthorities,
	tableSortToAPI,
	tableFiltersToAPI,
} from "src/api/npm";

const fetchCertificateAuthorities = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
) => {
	return getCertificateAuthorities(
		offset,
		limit,
		tableSortToAPI(sortBy),
		tableFiltersToAPI(filters),
	);
};

const useCertificateAuthorities = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
	options = {},
) => {
	return useQuery<CertificateAuthoritiesResponse, Error>({
		queryKey: ["certificate-authorities", { offset, limit, sortBy, filters }],
		queryFn: () => fetchCertificateAuthorities(offset, limit, sortBy, filters),
		keepPreviousData: true,
		staleTime: 15 * 1000, // 15 seconds
		...options,
	});
};

export { fetchCertificateAuthorities, useCertificateAuthorities };
