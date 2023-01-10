import * as api from "./base";
import { UpstreamsResponse } from "./responseTypes";

export async function getUpstreams(
	offset = 0,
	limit = 10,
	sort?: string,
	filters?: { [key: string]: string },
	abortController?: AbortController,
): Promise<UpstreamsResponse> {
	const { result } = await api.get(
		{
			url: "upstreams",
			params: { limit, offset, sort, expand: "user", ...filters },
		},
		abortController,
	);
	return result;
}
