import * as api from "./base";
import type { AccessList } from "./models";

export async function createAccessList(item: AccessList): Promise<AccessList> {
	return await api.post({
		url: "/nginx/access-lists",
		data: item,
	});
}
