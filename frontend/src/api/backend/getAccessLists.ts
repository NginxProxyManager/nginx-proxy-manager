import * as api from "./base";
import type { AccessListExpansion } from "./expansions";
import type { AccessList } from "./models";

export async function getAccessLists(expand?: AccessListExpansion[], params = {}): Promise<AccessList[]> {
	return await api.get({
		url: "/nginx/access-lists",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
