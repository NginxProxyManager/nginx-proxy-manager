import * as api from "./base";
import type { TokenResponse } from "./responseTypes";

export async function refreshToken(reload = true): Promise<TokenResponse> {
	return await api.get({
		url: "/tokens",
		reload,
	});
}
