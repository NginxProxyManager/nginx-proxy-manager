import * as api from "./base";

export async function toggleRedirectionHost(id: number, enabled: boolean): Promise<boolean> {
	return await api.post({
		url: `/nginx/redirection-hosts/${id}/${enabled ? "enable" : "disable"}`,
	});
}
