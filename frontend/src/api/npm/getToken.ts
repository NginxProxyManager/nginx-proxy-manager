import * as api from "./base";
import { TokenResponse } from "./responseTypes";

interface Options {
	payload: {
		type: string;
		identity: string;
		secret: string;
	};
}

export async function getToken(
	{ payload }: Options,
	abortController?: AbortController,
): Promise<TokenResponse> {
	const { result } = await api.post(
		{
			url: "/tokens",
			data: payload,
		},
		abortController,
	);
	return result;
}
