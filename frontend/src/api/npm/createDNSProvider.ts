import * as api from "./base";
import { DNSProvider } from "./models";

export async function createDNSProvider(
	data: DNSProvider,
	abortController?: AbortController,
): Promise<DNSProvider> {
	const { result } = await api.post(
		{
			url: "/dns-providers",
			data,
		},
		abortController,
	);
	return result;
}
