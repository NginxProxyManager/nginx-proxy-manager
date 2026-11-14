import * as api from "./base";
import type { SingleSignOnConfigExpansion } from "./expansions";
import type { SingleSignOnClient } from "./models";

export async function getSingleSignOnClients(
	expand?: SingleSignOnConfigExpansion[],
	params = {},
): Promise<SingleSignOnClient[]> {
	return await api.get({
		url: "/sso/clients",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
