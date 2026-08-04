import * as api from "./base";
import type { Upstream } from "./models";

export async function getUpstreams(params = {}): Promise<Upstream[]> {
	return await api.get({ url: "/nginx/upstreams", params });
}
