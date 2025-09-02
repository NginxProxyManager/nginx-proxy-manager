import * as api from "./base";
import type { TokenResponse } from "./responseTypes";

interface Options {
	payload: {
		identity: string;
		secret: string;
	};
}

export async function getToken({ payload }: Options, abortController?: AbortController): Promise<TokenResponse> {
	return await api.post(
		{
			url: "/tokens",
			data: payload,
		},
		abortController,
	);
}
