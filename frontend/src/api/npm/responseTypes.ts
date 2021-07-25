import { Sort, Setting } from "./models";

export interface HealthResponse {
	commit: string;
	errorReporting: boolean;
	healthy: boolean;
	setup: boolean;
	version: string;
}

export interface UserAuthResponse {
	id: number;
	userId: number;
	type: string;
	createdOn: number;
	updatedOn: number;
}

export interface TokenResponse {
	expires: number;
	token: string;
}

export interface UserResponse {
	id: number;
	name: string;
	nickname: string;
	email: string;
	createdOn: number;
	updatedOn: number;
	roles: string[];
	gravatarUrl: string;
	isDisabled: boolean;
	auth?: UserAuthResponse;
}

export interface SettingsResponse {
	total: number;
	offset: number;
	limit: number;
	sort: Sort[];
	items: Setting[];
}
