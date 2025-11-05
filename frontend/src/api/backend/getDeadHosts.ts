import * as api from "./base";
import type { HostExpansion } from "./expansions";
import type { DeadHost } from "./models";

export async function getDeadHosts(expand?: HostExpansion[], params = {}): Promise<DeadHost[]> {
	return await api.get({
		url: "/nginx/dead-hosts",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
