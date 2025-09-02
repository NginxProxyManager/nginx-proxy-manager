import * as api from "./base";

export async function deleteRedirectionHost(id: number, abortController?: AbortController): Promise<boolean> {
	return await api.del(
		{
			url: `/nginx/redirection-hosts/${id}`,
		},
		abortController,
	);
}
