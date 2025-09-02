import * as api from "./base";
import type { DeadHost } from "./models";

export type DeadHostExpansion = "owner" | "certificate";

export async function getDeadHosts(expand?: DeadHostExpansion[], params = {}): Promise<DeadHost[]> {
	return await api.get({
		url: "/nginx/dead-hosts",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
