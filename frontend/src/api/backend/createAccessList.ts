import * as api from "./base";
import type { AccessList } from "./models";

export async function createAccessList(item: AccessList, abortController?: AbortController): Promise<AccessList> {
	return await api.post(
		{
			url: "/nginx/access-lists",
			// todo: only use whitelist of fields for this data
			data: item,
		},
		abortController,
	);
}
