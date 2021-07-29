import * as api from "./base";
import { UsersResponse } from "./responseTypes";

export async function requestUsers(
	offset?: number,
	abortController?: AbortController,
): Promise<UsersResponse> {
	const { result } = await api.get(
		{
			url: "users",
			params: { limit: 20, offset: offset || 0 },
		},
		abortController,
	);
	return result;
}
