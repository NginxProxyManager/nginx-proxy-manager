import * as api from "./base";
import type { User } from "./models";

export async function updateAuth(
	userId: number | "me",
	newPassword: string,
	current?: string,
	abortController?: AbortController,
): Promise<User> {
	const data = {
		type: "password",
		current: current,
		secret: newPassword,
	};
	if (userId === "me") {
		data.current = current;
	}

	return await api.put(
		{
			url: `/users/${userId}/auth`,
			data,
		},
		abortController,
	);
}
