import * as api from "./base";
import type { Setting } from "./models";

export async function getSettings(expand?: string[], params = {}): Promise<Setting[]> {
	return await api.get({
		url: "/settings",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
