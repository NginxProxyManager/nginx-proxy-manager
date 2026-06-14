import * as api from "./base";
import type { UserExpansion } from "./expansions";
import type { User } from "./models";

export async function getUser(id: number | string = "me", expand?: UserExpansion[], params = {}): Promise<User> {
	const userId = id ? id : "me";
	return await api.get({
		url: `/users/${userId}`,
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
