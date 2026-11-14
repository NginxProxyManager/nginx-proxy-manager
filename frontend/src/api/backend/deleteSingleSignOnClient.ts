import * as api from "./base";

export async function deleteSingleSignOnClient(id: number): Promise<boolean> {
	return await api.del({
		url: `/sso/clients/${id}`,
	});
}
