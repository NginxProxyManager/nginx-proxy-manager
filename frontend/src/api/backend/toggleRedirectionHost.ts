import * as api from "./base";

export async function toggleRedirectionHost(
	id: number,
	enabled: boolean,
	abortController?: AbortController,
): Promise<boolean> {
	return await api.post(
		{
			url: `/nginx/redirection-hosts/${id}/${enabled ? "enable" : "disable"}`,
		},
		abortController,
	);
}
