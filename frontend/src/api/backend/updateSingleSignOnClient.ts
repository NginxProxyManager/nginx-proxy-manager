import * as api from "./base";
import type { SingleSignOnClient } from "./models";

export async function updateSingleSignOnClient(item: SingleSignOnClient): Promise<SingleSignOnClient> {
	// Remove readonly fields
	const { id, createdOn: _, modifiedOn: __, ownerUserId: ___, ...data } = item;

	return await api.put({
		url: `/sso/clients/${item.id}`,
		data,
	});
}
