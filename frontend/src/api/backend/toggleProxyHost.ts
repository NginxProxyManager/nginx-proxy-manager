import * as api from "./base";

export async function toggleProxyHost(
	id: number,
	enabled: boolean,
	abortController?: AbortController,
): Promise<boolean> {
	return await api.post(
		{
			url: `/nginx/proxy-hosts/${id}/${enabled ? "enable" : "disable"}`,
		},
		abortController,
	);
}
