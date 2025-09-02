import * as api from "./base";
import type { RedirectionHost } from "./models";

export type RedirectionHostExpansion = "owner" | "certificate";
export async function getRedirectionHosts(
	expand?: RedirectionHostExpansion[],
	params = {},
): Promise<RedirectionHost[]> {
	return await api.get({
		url: "/nginx/redirection-hosts",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
