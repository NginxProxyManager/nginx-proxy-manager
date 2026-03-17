import * as api from "./base";
import type { UpstreamHostExpansion } from "./expansions";
import type { UpstreamHost } from "./models";

export async function getUpstreamHosts(expand?: UpstreamHostExpansion[], params = {}): Promise<UpstreamHost[]> {
	return await api.get({
		url: "/nginx/upstream-hosts",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
