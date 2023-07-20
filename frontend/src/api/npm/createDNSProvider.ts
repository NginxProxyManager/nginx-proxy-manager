import { decamelizeKeys } from "humps";

import * as api from "./base";
import { DNSProvider } from "./models";

export async function createDNSProvider(
	data: DNSProvider,
	abortController?: AbortController,
): Promise<DNSProvider> {
	// Because the meta property of the data should not be decamelized,
	// we're going to decamelize the rest here instead of in base.ts
	const dcData: any = decamelizeKeys(data);
	if (typeof data.meta !== "undefined") {
		dcData.meta = data.meta;
	}

	const { result } = await api.post(
		{
			url: "/dns-providers",
			data: dcData,
			skipCamelize: true,
			skipDecamelize: true,
		},
		abortController,
	);
	return result;
}
