import * as api from "./base";
import { HostTemplatesResponse } from "./responseTypes";

export async function getHostTemplates(
	offset = 0,
	limit = 10,
	sort?: string,
	filters?: { [key: string]: string },
	abortController?: AbortController,
): Promise<HostTemplatesResponse> {
	const { result } = await api.get(
		{
			url: "host-templates",
			params: { limit, offset, sort, ...filters },
		},
		abortController,
	);
	return result;
}
