import * as api from "./base";
import type { DnsProviderExpansion } from "./expansions";
import type { DnsProvider } from "./models";

export async function getDnsProvider(id: number, expand?: DnsProviderExpansion[], params = {}): Promise<DnsProvider> {
	return await api.get({
		url: `/nginx/dns-providers/${id}`,
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
