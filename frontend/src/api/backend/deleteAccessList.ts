import * as api from "./base";

export async function deleteAccessList(id: number, abortController?: AbortController): Promise<boolean> {
	return await api.del(
		{
			url: `/nginx/access-lists/${id}`,
		},
		abortController,
	);
}
