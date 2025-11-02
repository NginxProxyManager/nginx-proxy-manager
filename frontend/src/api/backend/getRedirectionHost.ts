import * as api from "./base";
import type { HostExpansion } from "./expansions";
import type { RedirectionHost } from "./models";

export async function getRedirectionHost(id: number, expand?: HostExpansion[], params = {}): Promise<RedirectionHost> {
	return await api.get({
		url: `/nginx/redirection-hosts/${id}`,
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
