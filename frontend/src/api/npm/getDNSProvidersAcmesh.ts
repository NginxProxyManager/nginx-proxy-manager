import * as api from "./base";
import { DNSProvidersAcmesh } from "./models";

export async function getDNSProvidersAcmesh(
	abortController?: AbortController,
): Promise<DNSProvidersAcmesh[]> {
	const { result } = await api.get(
		{
			url: "dns-providers/acmesh",
			// Important for this endpoint:
			skipCamelize: true,
		},
		abortController,
	);
	return result;
}
