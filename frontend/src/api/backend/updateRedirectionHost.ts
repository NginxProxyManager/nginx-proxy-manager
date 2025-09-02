import * as api from "./base";
import type { RedirectionHost } from "./models";

export async function updateRedirectionHost(
	item: RedirectionHost,
	abortController?: AbortController,
): Promise<RedirectionHost> {
	// Remove readonly fields
	const { id, createdOn: _, modifiedOn: __, ...data } = item;

	return await api.put(
		{
			url: `/nginx/redirection-hosts/${id}`,
			data: data,
		},
		abortController,
	);
}
