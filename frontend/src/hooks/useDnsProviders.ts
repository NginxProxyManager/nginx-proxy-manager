import { useQuery } from "@tanstack/react-query";
import { type DNSProvider, getCertificateDNSProviders } from "src/api/backend";

const fetchDnsProviders = () => {
	return getCertificateDNSProviders();
};

const useDnsProviders = (options = {}) => {
	return useQuery<DNSProvider[], Error>({
		queryKey: ["dns-providers"],
		queryFn: () => fetchDnsProviders(),
		staleTime: 300 * 1000,
		...options,
	});
};

export { fetchDnsProviders, useDnsProviders };
