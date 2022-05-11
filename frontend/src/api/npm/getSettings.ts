import * as api from "./base";
import { SettingsResponse } from "./responseTypes";

export async function getSettings(
	offset = 0,
	limit = 10,
	sort?: string,
	filters?: { [key: string]: string },
	abortController?: AbortController,
): Promise<SettingsResponse> {
	const { result } = await api.get(
		{
			url: "settings",
			params: { limit, offset, sort, ...filters },
		},
		abortController,
	);
	return result;
}
