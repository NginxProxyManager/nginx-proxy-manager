import { camelizeKeys, decamelizeKeys } from "humps";
import AuthStore from "src/modules/AuthStore";
import type {
	TwoFactorEnableResponse,
	TwoFactorSetupResponse,
	TwoFactorStatusResponse,
} from "./responseTypes";
import * as api from "./base";

export async function get2FAStatus(userId: number | "me"): Promise<TwoFactorStatusResponse> {
	return await api.get({
		url: `/users/${userId}/2fa`,
	});
}

export async function start2FASetup(userId: number | "me"): Promise<TwoFactorSetupResponse> {
	return await api.post({
		url: `/users/${userId}/2fa/setup`,
	});
}

export async function enable2FA(userId: number | "me", code: string): Promise<TwoFactorEnableResponse> {
	return await api.put({
		url: `/users/${userId}/2fa/enable`,
		data: { code },
	});
}

export async function disable2FA(userId: number | "me", code: string): Promise<{ success: boolean }> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (AuthStore.token) {
		headers.Authorization = `Bearer ${AuthStore.token.token}`;
	}

	const response = await fetch(`/api/users/${userId}/2fa`, {
		method: "DELETE",
		headers,
		body: JSON.stringify(decamelizeKeys({ code })),
	});

	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error?.messageI18n || payload.error?.message || "Failed to disable 2FA");
	}
	return camelizeKeys(payload) as { success: boolean };
}

export async function regenerateBackupCodes(
	userId: number | "me",
	code: string,
): Promise<TwoFactorEnableResponse> {
	return await api.post({
		url: `/users/${userId}/2fa/backup-codes`,
		data: { code },
	});
}
