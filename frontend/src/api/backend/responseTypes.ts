import type { AppVersion } from "./models";

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
