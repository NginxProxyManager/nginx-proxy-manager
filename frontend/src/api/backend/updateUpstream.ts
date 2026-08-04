import * as api from "./base";
import type { Upstream } from "./models";

export async function updateUpstream({ id, ...data }: Partial<Upstream> & { id: number }): Promise<Upstream> {
	return await api.put({ url: `/nginx/upstreams/${id}`, data });
}
