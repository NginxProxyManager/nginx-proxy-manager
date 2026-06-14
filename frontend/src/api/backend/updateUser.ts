import * as api from "./base";
import type { User } from "./models";

export async function updateUser(item: User): Promise<User> {
	// Remove readonly fields
	const { id, createdOn: _, modifiedOn: __, ...data } = item;

	return await api.put({
		url: `/users/${id}`,
		data: data,
	});
}
