import * as api from "./base";
import type { UpstreamHost } from "./models";

export async function createUpstreamHost(item: UpstreamHost): Promise<UpstreamHost> {
	return await api.post({
		url: "/nginx/upstream-hosts",
		data: item,
	});
}
