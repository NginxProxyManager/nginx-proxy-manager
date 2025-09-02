import * as api from "./base";
import type { User } from "./models";

export type UserExpansion = "permissions";

export async function getUsers(expand?: UserExpansion[], params = {}): Promise<User[]> {
	return await api.get({
		url: "/users",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
