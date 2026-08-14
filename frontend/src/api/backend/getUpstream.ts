import * as api from "./base";
import type { Upstream } from "./models";

export async function getUpstream(id: number): Promise<Upstream> {
	return await api.get({ url: `/nginx/upstreams/${id}` });
}
