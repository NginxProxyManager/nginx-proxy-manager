import * as api from "./base";
import { User } from "./models";

export async function setUser(
	id: number | string = "me",
	data: any,
): Promise<User> {
	const userId = id ? id : "me";
	if (data.id) {
		delete data.id;
	}

	const { result } = await api.put({
		url: `/users/${userId}`,
		data,
	});
	return result;
}
