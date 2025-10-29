import * as api from "./base";
import type { Setting } from "./models";

export async function getSetting(id: string, expand?: string[], params = {}): Promise<Setting> {
	return await api.get({
		url: `/settings/${id}`,
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
