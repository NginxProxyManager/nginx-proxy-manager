import * as api from "./base";
import { User } from "./models";

export async function getUser(
	id: number | string = "me",
	params = {},
): Promise<User> {
	const userId = id ? id : "me";
	const { result } = await api.get({
		url: `/users/${userId}`,
		params,
	});
	return result;
}
