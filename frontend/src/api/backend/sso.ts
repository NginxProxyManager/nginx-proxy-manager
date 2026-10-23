import * as api from "./base";
import type { TokenResponse } from "./responseTypes";

export type SSOProtocol = "oidc" | "oauth2" | "saml";
export type SSOLoginMode = "parallel" | "sso_only";
export type SSOSecretAction = "keep" | "replace" | "clear";

interface CommonOAuthConfig {
	clientId: string;
	emailClaim: string;
	nameClaim?: string;
	scopes?: string[];
	tokenAuthMethod?: "client_secret_basic" | "client_secret_post";
}

export interface OIDCConfig extends CommonOAuthConfig {
	issuerUrl: string;
	useUserinfo?: boolean;
}

export interface OAuth2Config extends CommonOAuthConfig {
	authorizationUrl: string;
	tokenUrl: string;
	userinfoUrl: string;
	subjectClaim?: string;
	tokenAuthMethod: "client_secret_basic" | "client_secret_post";
}

export interface SAMLConfig {
	idpMetadataUrl?: string;
	idpMetadataXml?: string;
	spEntityId: string;
	emailAttribute?: string;
	emailNameId?: boolean;
	nameAttribute?: string;
	signRequests?: boolean;
}

export type SSOConfig = OIDCConfig | OAuth2Config | SAMLConfig;

export interface SSOPolicy {
	mode: SSOLoginMode;
	publicUrl: string;
	revision: number;
}

export interface SSOAllowlist {
	revision: number;
	emails: string[];
}

export interface SSOConnection {
	id: string;
	protocol: SSOProtocol;
	name: string;
	enabled: boolean;
	revision: number;
	config: SSOConfig | Record<string, never>;
	hasSecret: boolean;
}

export interface SSOConnectionInput {
	id?: string;
	revision?: number;
	protocol: SSOProtocol;
	name: string;
	enabled: boolean;
	config: SSOConfig;
	secretAction: SSOSecretAction;
	secretValue?: string;
	samlImportToken?: string;
}

export interface SSOMetadataPreview {
	entityId: string;
	ssoUrl: string;
	certificateFingerprints: string[];
	signRequests: boolean;
	spCertificate?: string;
	importToken: string;
}

export interface SSOLegacyStatus {
	conversionAvailable: boolean;
}

export interface AuthProviderConnection {
	id: string;
	name: string;
	protocol: SSOProtocol;
}

export interface AuthProviders {
	mode: SSOLoginMode;
	passwordLoginAvailable: boolean;
	connections: AuthProviderConnection[];
}

const result = <T>(response: { result: T }): T => response.result;

export async function getSSOPolicy(): Promise<SSOPolicy> {
	return result(await api.get({ url: "/sso/policy" }));
}

export async function updateSSOPolicy(policy: SSOPolicy): Promise<SSOPolicy> {
	return result(await api.put({ url: "/sso/policy", data: policy }));
}

export async function getSSOConnections(): Promise<SSOConnection[]> {
	return result(await api.get({ url: "/sso/connections" }));
}

export async function saveSSOConnection(input: SSOConnectionInput): Promise<SSOConnection> {
	const { id, ...data } = input;
	if (id) {
		return result(await api.put({ url: `/sso/connections/${id}`, data }));
	}
	return result(await api.post({ url: "/sso/connections", data }));
}

export async function deleteSSOConnection(input: Pick<SSOConnection, "id" | "revision">): Promise<boolean> {
	const response = await api.del({ url: `/sso/connections/${input.id}`, data: { revision: input.revision } });
	return response.result.deleted;
}

export async function testSSOConnection(id: string): Promise<{ ready: boolean }> {
	return result(await api.post({ url: `/sso/connections/${id}/test`, data: {} }));
}

export async function getSSOAllowlist(): Promise<SSOAllowlist> {
	return result(await api.get({ url: "/sso/allowlist" }));
}

export async function updateSSOAllowlist(value: SSOAllowlist): Promise<SSOAllowlist> {
	return result(await api.put({ url: "/sso/allowlist", data: value }));
}

export async function previewSSOMetadata(config: SAMLConfig): Promise<SSOMetadataPreview> {
	return result(await api.post({ url: "/sso/saml/metadata-preview", data: { config } }));
}

export async function getSSOLegacyStatus(): Promise<SSOLegacyStatus> {
	return result(await api.get({ url: "/sso/legacy-status" }));
}

export async function importLegacySSO(): Promise<SSOConnection> {
	return result(await api.post({ url: "/sso/legacy-import", data: {} }));
}

export async function getAuthProviders(): Promise<AuthProviders> {
	return result(await api.get({ url: "/auth/providers" }));
}

export async function exchangeSSOHandoff(code: string): Promise<TokenResponse> {
	return result(await api.post({ url: "/auth/sso/exchange", data: { code }, noAuth: true }));
}

export async function logoutSession(): Promise<void> {
	await api.post({ url: "/auth/logout", data: {}, suppressAuthInvalidation: true });
}
