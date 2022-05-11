import * as api from "./base";
import { DNSProvidersResponse } from "./responseTypes";

export async function getDNSProviders(
	offset = 0,
	limit = 10,
	sort?: string,
	filters?: { [key: string]: string },
	abortController?: AbortController,
): Promise<DNSProvidersResponse> {
	const { result } = await api.get(
		{
			url: "dns-providers",
			params: { limit, offset, sort, ...filters },
		},
		abortController,
	);
	return result;
}
