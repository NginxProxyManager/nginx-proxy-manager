export interface Sort {
	field: string;
	direction: "ASC" | "DESC";
}

export interface UserAuth {
	id: number;
	userId: number;
	type: string;
	createdOn: number;
	updatedOn: number;
}

export interface User {
	id: number;
	name: string;
	nickname: string;
	email: string;
	createdOn: number;
	updatedOn: number;
	gravatarUrl: string;
	isDisabled: boolean;
	notifications: Notification[];
	capabilities?: string[];
	auth?: UserAuth;
}

export interface Notification {
	title: string;
	seen: boolean;
}

export interface Setting {
	id: number;
	createdOn: number;
	modifiedOn: number;
	name: string;
	value: any;
}

// TODO: copy pasta not right
export interface Certificate {
	id: number;
	createdOn: number;
	modifiedOn: number;
	name: string;
	acmeshServer: string;
	caBundle: string;
	maxDomains: number;
	isWildcardSupported: boolean;
	isSetup: boolean;
}

export interface CertificateAuthority {
	id: number;
	createdOn: number;
	modifiedOn: number;
	name: string;
	acmeshServer: string;
	caBundle: string;
	maxDomains: number;
	isWildcardSupported: boolean;
	isReadonly: boolean;
}

export interface DNSProvider {
	id: number;
	createdOn: number;
	modifiedOn: number;
	userId: number;
	name: string;
	acmeshName: string;
	dnsSleep: number;
	meta: any;
}

export interface DNSProvidersAcmeshField {
	name: string;
	type: string;
	metaKey: string;
	isRequired: boolean;
	isSecret: boolean;
}

export interface DNSProvidersAcmesh {
	name: string;
	acmeshName: string;
	fields: DNSProvidersAcmeshField[];
}

export interface Host {
	id: number;
	createdOn: number;
	modifiedOn: number;
	userId: number;
	type: string;
	hostTemplateId: number;
	listenInterface: number;
	domainNames: string[];
	upstreamId: number;
	certificateId: number;
	accessListId: number;
	sslForced: boolean;
	cachingEnabled: boolean;
	blockExploits: boolean;
	allowWebsocketUpgrade: boolean;
	http2Support: boolean;
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	paths: string;
	upstreamOptions: string;
	advancedConfig: string;
	isDisabled: boolean;
}

export interface HostTemplate {
	id: number;
	createdOn: number;
	modifiedOn: number;
	userId: number;
	hostType: string;
	template: string;
}
