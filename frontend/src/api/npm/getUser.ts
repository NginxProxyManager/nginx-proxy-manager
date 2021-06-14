import * as api from "./base";
import { UserResponse } from "./responseTypes";

export async function getUser(
	id: number | string = "me",
): Promise<UserResponse> {
	const userId = id ? id : "me";
	const { result } = await api.get({
		url: `/users/${userId}`,
	});
	return result;
}
