import * as api from "./base";
import type { HostExpansion } from "./expansions";
import type { RedirectionHost } from "./models";

export async function getRedirectionHosts(expand?: HostExpansion[], params = {}): Promise<RedirectionHost[]> {
	return await api.get({
		url: "/nginx/redirection-hosts",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
