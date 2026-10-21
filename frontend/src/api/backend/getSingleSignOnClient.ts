import * as api from "./base";
import type { SingleSignOnConfigExpansion } from "./expansions";
import type { SingleSignOnClient } from "./models";

export async function getSingleSignOnClient(
	id: number | string,
	expand?: SingleSignOnConfigExpansion[],
	params = {},
): Promise<SingleSignOnClient> {
	return await api.get({
		url: `/sso/clients/${id}`,
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
