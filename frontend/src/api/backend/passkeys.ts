import * as api from "./base";
import type {
	PasskeyAuthOptionsResponse,
	PasskeyAuthVerifyResponse,
	PasskeyCredential,
	PasskeyRegOptionsResponse,
} from "./responseTypes";

// === Authentication (login) ===

export async function getPasskeyAuthOptions(
	email?: string,
): Promise<PasskeyAuthOptionsResponse> {
	return await api.post({
		url: "/tokens/passkey/options",
		data: email ? { email } : {},
		noAuth: true,
	});
}

export async function verifyPasskeyAuth(
	challengeToken: string,
	credential: string,
): Promise<PasskeyAuthVerifyResponse> {
	return await api.post({
		url: "/tokens/passkey/verify",
		data: { challengeToken, credential },
		noAuth: true,
	});
}

// === Registration (management, requires auth) ===

export async function getPasskeyRegOptions(
	userId: number | "me",
): Promise<PasskeyRegOptionsResponse> {
	return await api.post({
		url: `/users/${userId}/passkeys/register/options`,
	});
}

export async function verifyPasskeyRegistration(
	userId: number | "me",
	challengeToken: string,
	credential: string,
	friendlyName: string,
): Promise<PasskeyCredential> {
	return await api.post({
		url: `/users/${userId}/passkeys/register/verify`,
		data: { challengeToken, credential, friendlyName },
	});
}

export async function listPasskeys(
	userId: number | "me",
): Promise<PasskeyCredential[]> {
	return await api.get({
		url: `/users/${userId}/passkeys`,
	});
}

export async function renamePasskey(
	userId: number | "me",
	passkeyId: number,
	friendlyName: string,
): Promise<PasskeyCredential> {
	return await api.put({
		url: `/users/${userId}/passkeys/${passkeyId}`,
		data: { friendlyName },
	});
}

export async function deletePasskey(
	userId: number | "me",
	passkeyId: number,
): Promise<boolean> {
	return await api.del({
		url: `/users/${userId}/passkeys/${passkeyId}`,
	});
}
