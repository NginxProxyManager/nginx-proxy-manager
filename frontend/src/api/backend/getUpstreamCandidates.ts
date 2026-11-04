import * as api from "./base";
import type { UpstreamCandidates } from "./models";

export async function getUpstreamCandidates(
	refresh = false,
	abortController?: AbortController,
): Promise<UpstreamCandidates> {
	return await api.get(
		{
			url: "/upstreams/candidates",
			params: refresh ? { refresh: true } : undefined,
		},
		abortController,
	);
}
