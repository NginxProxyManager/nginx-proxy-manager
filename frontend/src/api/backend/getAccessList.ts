import * as api from "./base";
import type { AccessList } from "./models";

export async function getAccessList(id: number, abortController?: AbortController): Promise<AccessList> {
	return await api.get(
		{
			url: `/nginx/access-lists/${id}`,
		},
		abortController,
	);
}
