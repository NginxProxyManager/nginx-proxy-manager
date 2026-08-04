import * as api from "./base";

export async function deleteUpstream(id: number): Promise<boolean> {
	return await api.del({ url: `/nginx/upstreams/${id}` });
}
