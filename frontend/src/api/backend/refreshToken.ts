import * as api from "./base";
import type { TokenResponse } from "./responseTypes";

export async function refreshToken(abortController?: AbortController): Promise<TokenResponse> {
	return await api.get(
		{
			url: "/tokens",
		},
		abortController,
	);
}
