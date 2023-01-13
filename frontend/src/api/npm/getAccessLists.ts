import * as api from "./base";
import { AccessListsResponse } from "./responseTypes";

export async function getAccessLists(
	offset = 0,
	limit = 10,
	sort?: string,
	filters?: { [key: string]: string },
	abortController?: AbortController,
): Promise<AccessListsResponse> {
	const { result } = await api.get(
		{
			url: "access-lists",
			params: { limit, offset, sort, ...filters },
		},
		abortController,
	);
	return result;
}
