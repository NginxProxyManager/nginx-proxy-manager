import * as api from "./base";
import type { LoginAsTokenResponse } from "./responseTypes";

export async function loginAsUser(id: number): Promise<LoginAsTokenResponse> {
	return await api.post({
		url: `/users/${id}/login`,
	});
}
