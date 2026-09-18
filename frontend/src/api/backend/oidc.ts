import { camelizeKeys, decamelizeKeys } from "humps";
import AuthStore from "src/modules/AuthStore";
import type { LoginResponse } from "./getToken";

export interface OIDCSettings {
	enabled: boolean;
	autoLogin: boolean;
	issuer: string;
	publicUrl: string;
	clientId: string;
	clientSecret: string;
	clientSecretConfigured: boolean;
	scopes: string;
	revision: string;
	callbackUrl: string;
	tokenAuthMethod: "auto" | "client_secret_basic" | "client_secret_post";
}
export async function oidcRequest<T>(path: string, method = "GET", data?: object, signal?: AbortSignal): Promise<T> {
	const response = await fetch(`/api/oidc/${path}`, {
		method,
		signal,
		headers: {
			"Content-Type": "application/json",
			...(AuthStore.token ? { Authorization: `Bearer ${AuthStore.token.token}` } : {}),
		},
		body: data ? JSON.stringify(decamelizeKeys(data)) : undefined,
	});
	if (!response.ok || response.redirected) {
		let message = "OIDC request failed. Check the settings or sign in locally.";
		if (!response.redirected && path === "settings" && response.status === 400) {
			const payload = await response.json().catch(() => null);
			if (typeof payload?.error?.message === "string") message = payload.error.message;
		}
		throw new Error(message);
	}
	return camelizeKeys(await response.json()) as T;
}
export const getOIDCStatus = (signal?: AbortSignal) =>
	oidcRequest<{ enabled: boolean; autoLogin: boolean }>("status", "GET", undefined, signal);
export const exchangeOIDC = (signal?: AbortSignal) => oidcRequest<LoginResponse>("exchange", "POST", {}, signal);
export const startOIDC = (signal?: AbortSignal) => oidcRequest<{ url: string }>("start", "POST", {}, signal);
