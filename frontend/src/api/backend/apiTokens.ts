import * as api from "./base";

export const apiTokenResources = [
	"proxy_hosts",
	"redirection_hosts",
	"dead_hosts",
	"streams",
	"access_lists",
	"certificates",
] as const;

export type ApiTokenResource = (typeof apiTokenResources)[number];
export type ApiTokenScope = `${ApiTokenResource}:${"read" | "write"}`;

export interface ApiToken {
	status: "active" | "expired" | "revoked";
	id: number;
	name: string;
	scopes: ApiTokenScope[];
	visibility: "user" | "all";
	createdOn: string;
	expiresOn: string;
	revokedOn: string | null;
	lastUsedOn: string | null;
}

export interface ApiTokenOptions {
	scopes: ApiTokenScope[];
	visibility: "user" | "all";
	requires2fa: boolean;
	maxExpiryDays: number;
	defaultExpiryDays: number;
}

export interface CreateApiToken {
	name: string;
	scopes: ApiTokenScope[];
	expiresInDays: number;
	password: string;
	code?: string;
}

export function getApiTokens(abortController?: AbortController): Promise<ApiToken[]> {
	return api.get({ url: "/api-tokens" }, abortController);
}

export function getApiTokenOptions(abortController?: AbortController): Promise<ApiTokenOptions> {
	return api.get({ url: "/api-tokens/options" }, abortController);
}

// Call directly, not through a query/mutation cache: the response contains a one-time secret.
// Never retry creation automatically; a lost response may still have created a token.
export function createApiToken(data: CreateApiToken): Promise<ApiToken & { token: string }> {
	return api.post({ url: "/api-tokens", data });
}

export function revokeApiToken(id: number): Promise<{ revoked: true }> {
	return api.del({ url: `/api-tokens/${id}` });
}
