import * as api from "./base";
import type { Upstream } from "./models";

export async function createUpstream(item: Partial<Upstream>): Promise<Upstream> {
	return await api.post({ url: "/nginx/upstreams", data: item });
}
