import * as api from "./base";
import type { NewAuth, User, UserAuth } from "./models";

export interface NewUser {
	name: string;
	email: string;
	isDisabled?: boolean;
	auth?: UserAuth | NewAuth;
	capabilities?: string[];
}

export async function createUser(item: NewUser, noAuth?: boolean): Promise<User> {
	const { result } = await api.post({
		url: "/users",
		data: item,
		noAuth,
	});
	return result;
}
