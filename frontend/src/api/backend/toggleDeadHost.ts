import * as api from "./base";

export async function toggleDeadHost(
	id: number,
	enabled: boolean,
	abortController?: AbortController,
): Promise<boolean> {
	return await api.post(
		{
			url: `/nginx/dead-hosts/${id}/${enabled ? "enable" : "disable"}`,
		},
		abortController,
	);
}
