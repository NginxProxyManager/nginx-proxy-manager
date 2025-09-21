import * as api from "./base";
import type { UserPermissions } from "./models";

export async function setPermissions(userId: number, data: UserPermissions): Promise<boolean> {
	// Remove readonly fields
	return await api.put({
		url: `/users/${userId}/permissions`,
		data,
	});
}
