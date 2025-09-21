import * as api from "./base";

export async function deleteUser(id: number): Promise<boolean> {
	return await api.del({
		url: `/users/${id}`,
	});
}
