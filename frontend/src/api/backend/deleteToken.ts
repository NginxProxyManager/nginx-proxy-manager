import * as api from "./base";

export async function deleteToken(): Promise<boolean> {
	return await api.del({
		url: "/tokens",
	});
}
