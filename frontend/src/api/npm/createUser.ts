import * as api from "./base";
import { User } from "./models";

interface AuthOptions {
	type: string;
	secret: string;
}

interface Options {
	payload: {
		name: string;
		nickname: string;
		email: string;
		roles: string[];
		isDisabled: boolean;
		auth: AuthOptions;
	};
}

export async function createUser(
	{ payload }: Options,
	abortController?: AbortController,
): Promise<User> {
	const { result } = await api.post(
		{
			url: "/users",
			data: payload,
		},
		abortController,
	);
	return result;
}
