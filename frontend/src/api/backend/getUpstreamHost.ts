import * as api from "./base";
import type { UpstreamHostExpansion } from "./expansions";
import type { UpstreamHost } from "./models";

export async function getUpstreamHost(id: number, expand?: UpstreamHostExpansion[], params = {}): Promise<UpstreamHost> {
	return await api.get({
		url: `/nginx/upstream-hosts/${id}`,
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
