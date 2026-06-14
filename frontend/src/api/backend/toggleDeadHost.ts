import * as api from "./base";

export async function toggleDeadHost(id: number, enabled: boolean): Promise<boolean> {
	return await api.post({
		url: `/nginx/dead-hosts/${id}/${enabled ? "enable" : "disable"}`,
	});
}
