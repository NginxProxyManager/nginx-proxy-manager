import * as api from "./base";
import type { DeadHost } from "./models";

export async function updateDeadHost(item: DeadHost): Promise<DeadHost> {
	// Remove readonly fields
	const { id, createdOn: _, modifiedOn: __, ...data } = item;

	return await api.put({
		url: `/nginx/dead-hosts/${id}`,
		data: data,
	});
}
