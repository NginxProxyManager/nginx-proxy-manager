import * as api from "./base";
import { UserAuth } from "./models";

export async function setAuth(
	id: number | string = "me",
	data: any,
): Promise<UserAuth> {
	const userId = id ? id : "me";
	if (data.id) {
		delete data.id;
	}

	const { result } = await api.post({
		url: `/users/${userId}/auth`,
		data,
	});
	return result;
}
