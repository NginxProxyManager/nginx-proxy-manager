import * as api from "./base";
import type { AccessList } from "./models";

export type AccessListExpansion = "owner" | "items" | "clients";

export async function getAccessLists(expand?: AccessListExpansion[], params = {}): Promise<AccessList[]> {
	return await api.get({
		url: "/nginx/access-lists",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
