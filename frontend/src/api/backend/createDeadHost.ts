import * as api from "./base";
import type { DeadHost } from "./models";

export async function createDeadHost(item: DeadHost): Promise<DeadHost> {
	return await api.post({
		url: "/nginx/dead-hosts",
		data: item,
	});
}
