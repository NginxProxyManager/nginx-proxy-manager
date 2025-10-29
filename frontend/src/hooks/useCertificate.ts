import { useQuery } from "@tanstack/react-query";
import { type Certificate, getCertificate } from "src/api/backend";

const fetchCertificate = (id: number) => {
	return getCertificate(id, ["owner"]);
};

const useCertificate = (id: number, options = {}) => {
	return useQuery<Certificate, Error>({
		queryKey: ["certificate", id],
		queryFn: () => fetchCertificate(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

export { useCertificate };
