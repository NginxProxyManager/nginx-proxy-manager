import * as api from "./base";
import type {
	AuthCredentialTest,
	AuthProvider,
	AuthSyncResult,
	AuthSyncStatus,
	LoginOptions,
	NewAuthProvider,
} from "./models";
import type { TokenResponse, TwoFactorChallengeResponse } from "./responseTypes";

/**
 * The sign in methods offered on the login screen. Unauthenticated.
 */
export async function getLoginOptions(): Promise<LoginOptions> {
	return await api.get({ url: "/auth/providers" });
}

/**
 * Swaps the single use code handed back by a SAML or OAuth login for a token.
 */
export async function exchangeSsoCode(code: string): Promise<TokenResponse | TwoFactorChallengeResponse> {
	return await api.post({
		url: "/auth/exchange",
		data: { code },
		noAuth: true,
	});
}

/**
 * Where to send the browser to begin a redirect based login.
 */
export function providerLoginUrl(providerId: number): string {
	return `/api/auth/${providerId}/login`;
}

/**
 * Where the identity provider can fetch this instance's SAML metadata.
 */
export function providerMetadataUrl(providerId: number): string {
	return `/api/auth/${providerId}/metadata`;
}

export async function getAuthProviders(): Promise<AuthProvider[]> {
	return await api.get({ url: "/auth-providers" });
}

export async function createAuthProvider(item: NewAuthProvider): Promise<AuthProvider> {
	return await api.post({ url: "/auth-providers", data: item });
}

export async function updateAuthProvider(id: number, item: Partial<NewAuthProvider>): Promise<AuthProvider> {
	return await api.put({ url: `/auth-providers/${id}`, data: item });
}

export async function deleteAuthProvider(id: number): Promise<boolean> {
	return await api.del({ url: `/auth-providers/${id}` });
}

export interface ConfigTestResult {
	valid: boolean;
	/** What succeeded, when it did */
	detail?: string;
	/** Why it failed, when it did */
	error?: string;
}

/**
 * Check connection settings that have not been saved yet. Pass the id of an
 * existing provider so its stored secrets fill in any field left blank.
 */
export async function testAuthProviderConfig(data: {
	type: string;
	meta: Record<string, any>;
	id?: number;
	name?: string;
}): Promise<ConfigTestResult> {
	return await api.post({ url: "/auth-providers/test", data });
}

export async function testAuthProvider(id: number): Promise<{ valid: boolean }> {
	return await api.post({ url: `/auth-providers/${id}/test` });
}

/** Verify a real username and password against a directory, without signing in. */
export async function testAuthProviderCredentials(
	id: number,
	username: string,
	password: string,
): Promise<AuthCredentialTest> {
	return await api.post({
		url: `/auth-providers/${id}/test-credentials`,
		data: { username, password },
	});
}

export async function getAuthProviderSync(id: number): Promise<AuthSyncStatus> {
	return await api.get({ url: `/auth-providers/${id}/sync` });
}

export async function runAuthProviderSync(id: number): Promise<AuthSyncResult> {
	return await api.post({ url: `/auth-providers/${id}/sync` });
}

export async function getLocalAuth(): Promise<{ localEnabled: boolean }> {
	return await api.get({ url: "/auth-providers/local" });
}

export async function setLocalAuth(localEnabled: boolean): Promise<{ localEnabled: boolean }> {
	return await api.put({ url: "/auth-providers/local", data: { localEnabled } });
}
