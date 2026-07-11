import * as api from "./base";
import type { DnsProvider } from "./models";

export async function createDnsProvider(item: DnsProvider): Promise<DnsProvider> {
	return await api.post({
		url: "/nginx/dns-providers",
		data: item,
	});
}
