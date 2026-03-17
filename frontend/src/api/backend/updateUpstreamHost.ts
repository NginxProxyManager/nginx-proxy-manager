import * as api from "./base";
import type { UpstreamHost } from "./models";

export async function updateUpstreamHost(item: UpstreamHost): Promise<UpstreamHost> {
	// Remove readonly fields
	const { id, createdOn: _, modifiedOn: __, ...data } = item;

	return await api.put({
		url: `/nginx/upstream-hosts/${id}`,
		data: data,
	});
}
