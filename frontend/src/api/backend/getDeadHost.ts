import * as api from "./base";
import type { DeadHost } from "./models";

export async function getDeadHost(id: number, abortController?: AbortController): Promise<DeadHost> {
	return await api.get(
		{
			url: `/nginx/dead-hosts/${id}`,
		},
		abortController,
	);
}
