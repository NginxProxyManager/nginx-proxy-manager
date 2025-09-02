import type { AppVersion } from "./models";

export interface HealthResponse {
	status: string;
	version: AppVersion;
}

export interface TokenResponse {
	expires: number;
	token: string;
}

export interface ValidatedCertificateResponse {
	certificate: Record<string, any>;
	certificateKey: boolean;
}

export type Binary = number & { readonly __brand: unique symbol };
