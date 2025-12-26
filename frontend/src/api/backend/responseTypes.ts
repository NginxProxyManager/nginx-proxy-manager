import type { User } from "./models";

export interface HealthResponse {
	status: string;
	version: string;
	setup: boolean;
	password: boolean;
	oidc: boolean;
}

export interface TokenResponse {
	expires: number;
}

export interface ValidatedCertificateResponse {
	certificate: Record<string, any>;
	certificateKey: boolean;
}

export interface LoginAsTokenResponse extends TokenResponse {
	user: User;
}

export interface VersionCheckResponse {
	current: string | null;
	latest: string | null;
	updateAvailable: boolean;
}
