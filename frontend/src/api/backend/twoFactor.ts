import * as api from "./base";
import type { TwoFactorEnableResponse, TwoFactorSetupResponse, TwoFactorStatusResponse } from "./responseTypes";

export async function get2FAStatus(userId: number | "me"): Promise<TwoFactorStatusResponse> {
	return await api.get({
		url: `/users/${userId}/2fa`,
	});
}

export async function start2FASetup(userId: number | "me"): Promise<TwoFactorSetupResponse> {
	return await api.post({
		url: `/users/${userId}/2fa`,
	});
}

export async function enable2FA(userId: number | "me", code: string): Promise<TwoFactorEnableResponse> {
	return await api.post({
		url: `/users/${userId}/2fa/enable`,
		data: { code },
	});
}

export async function disable2FA(userId: number | "me", code: string): Promise<boolean> {
	return await api.del({
		url: `/users/${userId}/2fa`,
		params: {
			code,
		},
	});
}

export async function regenerateBackupCodes(userId: number | "me", code: string): Promise<TwoFactorEnableResponse> {
	return await api.post({
		url: `/users/${userId}/2fa/backup-codes`,
		data: { code },
	});
}
