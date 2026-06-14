import * as api from "./base";
import type { RedirectionHost } from "./models";

export async function createRedirectionHost(item: RedirectionHost): Promise<RedirectionHost> {
	return await api.post({
		url: "/nginx/redirection-hosts",
		data: item,
	});
}
