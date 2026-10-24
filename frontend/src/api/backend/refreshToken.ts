import * as api from "./base";
import type { TokenResponse } from "./responseTypes";

export async function refreshToken(): Promise<TokenResponse> {
	const { result } = await api.post({
		url: "/auth/refresh",
	});
	return result;
}
