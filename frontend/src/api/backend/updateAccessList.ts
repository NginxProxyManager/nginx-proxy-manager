import * as api from "./base";
import type { AccessList } from "./models";

export async function updateAccessList(item: AccessList): Promise<AccessList> {
	// Remove readonly fields
	const { id, createdOn: _, modifiedOn: __, ...data } = item;

	return await api.put({
		url: `/nginx/access-lists/${id}`,
		data: data,
	});
}
