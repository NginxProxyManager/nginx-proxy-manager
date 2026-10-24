import * as api from "./base";
import type { UserExpansion } from "./expansions";
import type { User } from "./models";

export async function getUsers(expand?: UserExpansion[], params = {}): Promise<User[]> {
	const { result } = await api.get({
		url: "/users",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
	return result.items;
}
