import * as api from "./base";
import type { AccessListToken } from "./models";

export interface NewAccessListToken {
	name: string;
	headerName: string;
	value: string;
	forward: boolean;
}

export async function createAccessListToken(listId: number, token: NewAccessListToken): Promise<AccessListToken> {
	return await api.post({
		url: `/nginx/access-lists/${listId}/tokens`,
		data: token,
	});
}

export async function updateAccessListToken(
	listId: number,
	tokenId: number,
	data: { name?: string; forward?: boolean },
): Promise<AccessListToken> {
	return await api.put({
		url: `/nginx/access-lists/${listId}/tokens/${tokenId}`,
		data,
	});
}

export async function deleteAccessListToken(listId: number, tokenId: number): Promise<boolean> {
	return await api.del({
		url: `/nginx/access-lists/${listId}/tokens/${tokenId}`,
	});
}
