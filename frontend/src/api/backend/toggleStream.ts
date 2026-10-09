import * as api from "./base";

export async function toggleStream(id: number, enabled: boolean): Promise<boolean> {
	return await api.post({
		url: `/nginx/streams/${id}/${enabled ? "enable" : "disable"}`,
	});
}
