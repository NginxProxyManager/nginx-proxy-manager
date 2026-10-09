import * as api from "./base";
import type { TokenResponse, TwoFactorChallengeResponse } from "./responseTypes";

export type LoginResponse = TokenResponse | TwoFactorChallengeResponse;

export function isTwoFactorChallenge(response: LoginResponse): response is TwoFactorChallengeResponse {
	return "requires2fa" in response && response.requires2fa === true;
}

interface Payload {
	type: string;
	identity: string;
	secret: string;
}
export async function getToken(payload: Payload): Promise<LoginResponse> {
	const { result } = await api.post(
		{
			url: "/auth",
			data: payload,
		},
	);
	return result;
}

export async function verify2FA(challengeToken: string, code: string): Promise<TokenResponse> {
	return await api.post({
		url: "/auth/2fa",
		data: { challengeToken, code },
	});
}
