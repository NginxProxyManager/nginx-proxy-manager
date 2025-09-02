import * as api from "./base";
import type { User } from "./models";

export async function createUser(item: User, abortController?: AbortController): Promise<User> {
	return await api.post(
		{
			url: "/users",
			// todo: only use whitelist of fields for this data
			data: item,
		},
		abortController,
	);
}
