import * as api from "./base";
import { HostsResponse } from "./responseTypes";

export async function getHosts(
	offset = 0,
	limit = 10,
	sort?: string,
	filters?: { [key: string]: string },
	abortController?: AbortController,
): Promise<HostsResponse> {
	const { result } = await api.get(
		{
			url: "hosts",
			params: { limit, offset, sort, expand: "user,certificate", ...filters },
		},
		abortController,
	);
	return result;
}
