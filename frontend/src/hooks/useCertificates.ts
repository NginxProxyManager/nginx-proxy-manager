import { useQuery } from "@tanstack/react-query";

import {
	getCertificates,
	CertificatesResponse,
	tableSortToAPI,
	tableFiltersToAPI,
} from "src/api/npm";

const fetchCertificates = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
) => {
	return getCertificates(
		offset,
		limit,
		tableSortToAPI(sortBy),
		tableFiltersToAPI(filters),
	);
};

const useCertificates = (
	offset = 0,
	limit = 10,
	sortBy?: any,
	filters?: any,
	options = {},
) => {
	return useQuery<CertificatesResponse, Error>({
		queryKey: ["certificates", { offset, limit, sortBy, filters }],
		queryFn: () => fetchCertificates(offset, limit, sortBy, filters),
		keepPreviousData: true,
		staleTime: 15 * 1000, // 15 seconds
		...options,
	});
};

export { fetchCertificates, useCertificates };
