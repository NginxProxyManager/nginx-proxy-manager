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
	roles: string[];
	gravatarUrl: string;
	isDisabled: boolean;
	auth?: UserAuth;
}

export interface Setting {
	id: number;
	createdOn: number;
	modifiedOn: number;
	name: string;
	value: any;
}

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
	isSetup: boolean;
}
