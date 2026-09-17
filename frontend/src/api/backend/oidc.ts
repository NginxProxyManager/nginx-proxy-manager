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
export async function oidcRequest<T>(path: string, method = "GET", data?: object): Promise<T> {
	const response = await fetch(`/api/oidc/${path}`, {
		method,
		headers: {
			"Content-Type": "application/json",
			...(AuthStore.token ? { Authorization: `Bearer ${AuthStore.token.token}` } : {}),
		},
		body: data ? JSON.stringify(decamelizeKeys(data)) : undefined,
	});
	if (!response.ok || response.redirected)
		throw new Error("OIDC request failed. Check the settings or sign in locally.");
	return camelizeKeys(await response.json()) as T;
}
export const getOIDCStatus = () => oidcRequest<{ enabled: boolean; autoLogin: boolean }>("status");
export const exchangeOIDC = () => oidcRequest<LoginResponse>("exchange", "POST", {});
export const startOIDC = async () => {
	const result = await oidcRequest<{ url: string }>("start", "POST", {});
	window.location.assign(result.url);
};
