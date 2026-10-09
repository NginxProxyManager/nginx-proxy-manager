import * as api from "./base";

export async function deleteAccessList(id: number): Promise<boolean> {
	return await api.del({
		url: `/nginx/access-lists/${id}`,
	});
}
