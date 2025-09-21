import * as api from "./base";
import type { RedirectionHost } from "./models";

export async function createRedirectionHost(item: RedirectionHost): Promise<RedirectionHost> {
	return await api.post({
		url: "/nginx/redirection-hosts",
		// todo: only use whitelist of fields for this data
		data: item,
	});
}
