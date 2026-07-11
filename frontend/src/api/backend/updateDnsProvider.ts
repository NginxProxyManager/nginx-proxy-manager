import * as api from "./base";
import type { DnsProvider } from "./models";

export async function updateDnsProvider(item: DnsProvider): Promise<DnsProvider> {
	// Remove readonly fields
	const { id, createdOn: _, modifiedOn: __, ...data } = item;

	return await api.put({
		url: `/nginx/dns-providers/${id}`,
		data: data,
	});
}
