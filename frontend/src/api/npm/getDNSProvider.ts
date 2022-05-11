import * as api from "./base";
import { DNSProvider } from "./models";

export async function getDNSProvider(
	id: number,
	params = {},
): Promise<DNSProvider> {
	const { result } = await api.get({
		url: `/dns-providers/${id}`,
		params,
	});
	return result;
}
