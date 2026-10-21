import * as api from "./base";

export async function toggleSingleSignOnClient(id: number, enabled: boolean): Promise<boolean> {
	return await api.post({
		url: `/sso/clients/${id}/${enabled ? "enable" : "disable"}`,
	});
}
