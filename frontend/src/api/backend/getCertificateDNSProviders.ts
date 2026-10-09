import * as api from "./base";
import type { DNSProvider } from "./models";

export async function getCertificateDNSProviders(params = {}): Promise<DNSProvider[]> {
	return await api.get({
		url: "/nginx/certificates/dns-providers",
		params,
	});
}
