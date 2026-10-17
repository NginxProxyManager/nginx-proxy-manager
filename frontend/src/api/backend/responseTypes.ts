import type { AppVersion, User } from "./models";

export interface HealthResponse {
	status: string;
	version: AppVersion;
	setup: boolean;
}

export interface TokenResponse {
	expires: number;
	token: string;
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

export interface TwoFactorChallengeResponse {
	requires2fa: boolean;
	challengeToken: string;
}

export interface TwoFactorStatusResponse {
	enabled: boolean;
	backupCodesRemaining: number;
}

export interface TwoFactorSetupResponse {
	secret: string;
	otpauthUrl: string;
}

export interface TwoFactorEnableResponse {
	backupCodes: string[];
}

export interface PasskeyAuthOptionsResponse {
	options: any;
	challengeToken: string;
}

export interface PasskeyAuthVerifyResponse {
	token: string;
	expires: number;
}

export interface PasskeyRegOptionsResponse {
	options: any;
	challengeToken: string;
}

export interface PasskeyCredential {
	id: number;
	friendlyName: string;
	createdOn: string;
	deviceType: string;
	backedUp: boolean;
}
