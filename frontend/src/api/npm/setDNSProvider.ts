import * as api from "./base";
import { DNSProvider } from "./models";

export async function setDNSProvider(
	id: number,
	data: any,
): Promise<DNSProvider> {
	if (data.id) {
		delete data.id;
	}

	const { result } = await api.put({
		url: `/dns-providers/${id}`,
		data,
	});
	return result;
}
