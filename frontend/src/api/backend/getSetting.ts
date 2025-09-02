import * as api from "./base";
import type { Setting } from "./models";

export async function getSetting(id: string, abortController?: AbortController): Promise<Setting> {
	return await api.get(
		{
			url: `/settings/${id}`,
		},
		abortController,
	);
}
