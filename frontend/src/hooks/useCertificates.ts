import { useQuery } from "@tanstack/react-query";
import { type Certificate, type CertificateExpansion, getCertificates } from "src/api/backend";

const paramsForAgent = (agentId?: string) => (agentId && agentId !== "local" ? { agent_id: agentId } : {});

const fetchCertificates = (expand?: CertificateExpansion[], agentId?: string) => {
	return getCertificates(expand, paramsForAgent(agentId));
};

const useCertificates = (expand?: CertificateExpansion[], options: any = {}, agentId?: string) => {
	return useQuery<Certificate[], Error>({
		queryKey: ["certificates", { expand, agentId }],
		queryFn: () => fetchCertificates(expand, agentId),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchCertificates, useCertificates };
