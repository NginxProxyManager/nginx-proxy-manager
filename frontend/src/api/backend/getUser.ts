import * as api from "./base";
import type { User } from "./models";

export async function getUser(id: number | string = "me", params = {}): Promise<User> {
	const userId = id ? id : "me";
	return await api.get({
		url: `/users/${userId}`,
		params,
	});
}
