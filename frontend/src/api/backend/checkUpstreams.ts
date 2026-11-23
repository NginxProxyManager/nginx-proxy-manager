import * as api from "./base";
import type { UpstreamCheckResponse, UpstreamCheckTarget } from "./models";

export async function checkUpstreams(
	targets: UpstreamCheckTarget[],
	abortController?: AbortController,
): Promise<UpstreamCheckResponse> {
	return await api.post(
		{
			url: "/upstreams/check",
			data: { targets },
		},
		abortController,
	);
}
