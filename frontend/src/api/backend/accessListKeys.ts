import * as api from "./base";
import type { AccessListKey } from "./models";
import type { AccessListKeyInviteResponse } from "./responseTypes";

export async function createAccessListKeyInvite(listId: number, name: string): Promise<AccessListKeyInviteResponse> {
	return await api.post({
		url: `/nginx/access-lists/${listId}/keys/invites`,
		data: { name },
	});
}

export async function renameAccessListKey(listId: number, keyId: number, name: string): Promise<AccessListKey> {
	return await api.put({
		url: `/nginx/access-lists/${listId}/keys/${keyId}`,
		data: { name },
	});
}

export async function deleteAccessListKey(listId: number, keyId: number): Promise<boolean> {
	return await api.del({
		url: `/nginx/access-lists/${listId}/keys/${keyId}`,
	});
}
