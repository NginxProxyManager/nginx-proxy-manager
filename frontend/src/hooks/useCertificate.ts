import { useQuery } from "@tanstack/react-query";
import { type Certificate, getCertificate } from "src/api/backend";

const fetchCertificate = (id: number, agentId?: string) => {
	return getCertificate(id, ["owner"], agentId);
};

const useCertificate = (id: number, options = {}, agentId?: string) => {
	return useQuery<Certificate, Error>({
		queryKey: ["certificate", id, { agentId }],
		queryFn: () => fetchCertificate(id, agentId),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

export { useCertificate };
