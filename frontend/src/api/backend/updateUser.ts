import * as api from "./base";
import type { User } from "./models";

export type UserUpdate = Pick<User, "id"> &
	Partial<Pick<User, "name" | "email" | "isDisabled" | "capabilities" | "passwordLoginEnabled">>;

export async function updateUser(item: UserUpdate): Promise<User> {
	const { id, ...data } = item;
	const { result } = await api.put({
		url: `/users/${id}`,
		data: data,
	});
	return result;
}
