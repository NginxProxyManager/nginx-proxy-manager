import * as api from "./base";

export async function removeAuth(userId: number | "me", current?: string): Promise<boolean> {
	return await api.del({
		url: `/users/${userId}/auth`,
		data: current ? { current } : undefined,
	});
}
