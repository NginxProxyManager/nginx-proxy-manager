import * as api from "./base";
import type { VersionCheckResponse } from "./responseTypes";

export async function checkVersion(): Promise<VersionCheckResponse> {
	return await api.get({
		url: "/version/check",
	});
}
