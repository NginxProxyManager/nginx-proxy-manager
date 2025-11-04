import * as api from "./base";

export async function deleteRedirectionHost(id: number): Promise<boolean> {
	return await api.del({
		url: `/nginx/redirection-hosts/${id}`,
	});
}
