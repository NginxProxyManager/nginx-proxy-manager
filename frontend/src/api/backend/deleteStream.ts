import * as api from "./base";

export async function deleteStream(id: number, abortController?: AbortController): Promise<boolean> {
	return await api.del(
		{
			url: `/nginx/streams/${id}`,
		},
		abortController,
	);
}
