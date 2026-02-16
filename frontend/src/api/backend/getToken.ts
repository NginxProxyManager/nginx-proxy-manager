import * as api from "./base";
import type { TokenResponse, TwoFactorChallengeResponse } from "./responseTypes";

export type LoginResponse = TokenResponse | TwoFactorChallengeResponse;

export function isTwoFactorChallenge(response: LoginResponse): response is TwoFactorChallengeResponse {
	return "requires2fa" in response && response.requires2fa === true;
}

export async function getToken(identity: string, secret: string): Promise<LoginResponse> {
	return await api.post({
		url: "/tokens",
		data: { identity, secret },
	});
}

export async function verify2FA(challengeToken: string, code: string): Promise<TokenResponse> {
	return await api.post({
		url: "/tokens/2fa",
		data: { challengeToken, code },
	});
}
