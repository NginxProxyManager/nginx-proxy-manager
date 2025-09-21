import * as api from "./base";
import type { TokenResponse } from "./responseTypes";

export async function getToken(identity: string, secret: string): Promise<TokenResponse> {
	return await api.post({
		url: "/tokens",
		data: { identity, secret },
	});
}
