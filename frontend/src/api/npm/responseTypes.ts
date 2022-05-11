import {
	Certificate,
	CertificateAuthority,
	DNSProvider,
	Host,
	HostTemplate,
	Setting,
	Sort,
	User,
} from "./models";

export interface BaseResponse {
	total: number;
	offset: number;
	limit: number;
	sort: Sort[];
}

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

export interface SettingsResponse extends BaseResponse {
	items: Setting[];
}

export interface CertificatesResponse extends BaseResponse {
	items: Certificate[];
}

export interface CertificateAuthoritiesResponse extends BaseResponse {
	items: CertificateAuthority[];
}

export interface UsersResponse extends BaseResponse {
	items: User[];
}

export interface DNSProvidersResponse extends BaseResponse {
	items: DNSProvider[];
}

export interface HostsResponse extends BaseResponse {
	items: Host[];
}

export interface HostTemplatesResponse extends BaseResponse {
	items: HostTemplate[];
}
