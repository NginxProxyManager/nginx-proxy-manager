import * as api from "./base";
import { TokenResponse } from "./responseTypes";

export async function getSSEToken(
	abortController?: AbortController,
): Promise<TokenResponse> {
	const { result } = await api.post(
		{
			url: "/tokens/sse",
		},
		abortController,
	);
	return result;
}
