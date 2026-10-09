import * as api from "./base";

export interface AppVersion {
	major: number;
	minor: number;
	patch: number;
}

export interface HealthResponse {
	commit: string;
	dbSetup: boolean;
	errorReporting: boolean;
	healthy: boolean;
	setup: boolean;
	version: AppVersion;
}

export async function getHealth(): Promise<HealthResponse> {
	const { result } = await api.get({
		url: "/",
	});
	return result;
}
