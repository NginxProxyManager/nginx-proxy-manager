import * as api from "./base";
import type { Setting } from "./models";

export async function updateSetting(item: Setting): Promise<Setting> {
	// Remove readonly fields
	const { id, ...data } = item;

	return await api.put({
		url: `/settings/${id}`,
		data: data,
	});
}
