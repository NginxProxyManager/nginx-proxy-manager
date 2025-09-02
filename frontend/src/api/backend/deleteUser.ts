import * as api from "./base";

export async function deleteUser(id: number, abortController?: AbortController): Promise<boolean> {
	return await api.del(
		{
			url: `/users/${id}`,
		},
		abortController,
	);
}
