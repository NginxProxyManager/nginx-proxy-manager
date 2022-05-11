import * as api from "./base";
import { DNSProvidersAcmesh } from "./models";

export async function getDNSProvidersAcmesh(
	abortController?: AbortController,
): Promise<DNSProvidersAcmesh[]> {
	const { result } = await api.get(
		{
			url: "dns-providers/acmesh",
		},
		abortController,
	);
	return result;
}
