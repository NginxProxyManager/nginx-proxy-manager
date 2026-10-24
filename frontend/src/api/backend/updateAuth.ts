import * as api from "./base";
import type { UserAuth } from "./models";

export async function updateAuth(userId: number | "me", newPassword: string, current?: string): Promise<UserAuth> {
	const data = {
		type: "local",
		currentSecret: current,
		secret: newPassword,
	};

	const { result } = await api.post({
		url: `/users/${userId}/auth`,
		data,
	});
	return result;
}
