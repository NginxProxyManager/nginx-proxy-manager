import * as api from "./base";
import type { Upstream } from "./models";

export async function publishUpstream(id: number): Promise<Upstream> {
	return await api.post({ url: `/nginx/upstreams/${id}/publish` });
}
