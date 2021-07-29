import {
	Certificate,
	CertificateAuthority,
	Setting,
	Sort,
	User,
} from "./models";

export interface HealthResponse {
	commit: string;
	errorReporting: boolean;
	healthy: boolean;
	setup: boolean;
	version: string;
}

export interface TokenResponse {
	expires: number;
	token: string;
}

export interface SettingsResponse {
	total: number;
	offset: number;
	limit: number;
	sort: Sort[];
	items: Setting[];
}

export interface CertificatesResponse {
	total: number;
	offset: number;
	limit: number;
	sort: Sort[];
	items: Certificate[];
}

export interface CertificateAuthoritiesResponse {
	total: number;
	offset: number;
	limit: number;
	sort: Sort[];
	items: CertificateAuthority[];
}

export interface UsersResponse {
	total: number;
	offset: number;
	limit: number;
	sort: Sort[];
	items: User[];
}
