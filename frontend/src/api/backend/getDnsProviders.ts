import * as api from "./base";
import type { DnsProviderExpansion } from "./expansions";
import type { DnsProvider } from "./models";

export async function getDnsProviders(expand?: DnsProviderExpansion[], params = {}): Promise<DnsProvider[]> {
	return await api.get({
		url: "/nginx/dns-providers",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
