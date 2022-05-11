import * as api from "./base";
import { UsersResponse } from "./responseTypes";

export async function getUsers(
	offset = 0,
	limit = 10,
	sort?: string,
	filters?: { [key: string]: string },
	abortController?: AbortController,
): Promise<UsersResponse> {
	const { result } = await api.get(
		{
			url: "users",
			params: { limit, offset, sort, expand: "capabilities", ...filters },
		},
		abortController,
	);
	return result;
}
