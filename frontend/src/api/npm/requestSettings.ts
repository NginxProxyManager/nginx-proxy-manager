import * as api from "./base";
import { SettingsResponse } from "./responseTypes";

export async function requestSettings(
	offset?: number,
	abortController?: AbortController,
): Promise<SettingsResponse> {
	const { result } = await api.get(
		{
			url: "settings",
			params: { limit: 20, offset: offset || 0 },
		},
		abortController,
	);
	return result;
}
