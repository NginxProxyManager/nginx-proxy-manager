import * as api from "./base";
import { paramsForAgent } from "./agentParams";
import type { User } from "./models";

export interface AuthOptions {
	type: string;
	secret: string;
}

export interface NewUser {
	name: string;
	nickname: string;
	email: string;
	isDisabled?: boolean;
	auth?: AuthOptions;
	roles?: string[];
}

export async function createUser(item: NewUser, noAuth?: boolean, agentId?: string): Promise<User> {
	return await api.post({
		url: "/users",
		params: paramsForAgent(agentId),
		data: item,
		noAuth,
	});
}
