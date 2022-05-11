import * as api from "./base";
import { User } from "./models";

export interface AuthOptions {
	type: string;
	secret: string;
}

export interface NewUser {
	name: string;
	nickname: string;
	email: string;
	isDisabled: boolean;
	auth: AuthOptions;
	capabilities: string[];
}

export async function createUser(
	data: NewUser,
	abortController?: AbortController,
): Promise<User> {
	const { result } = await api.post(
		{
			url: "/users",
			data,
		},
		abortController,
	);
	return result;
}
