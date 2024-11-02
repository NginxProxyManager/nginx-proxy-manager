import * as api from "./base";
import { TokenResponse } from "./responseTypes";

export async function refreshToken(
	abortController?: AbortController,
): Promise<TokenResponse> {
	const { result } = await api.post(
		{
			url: "/auth/refresh",
		},
		abortController,
	);
	return result;
}
