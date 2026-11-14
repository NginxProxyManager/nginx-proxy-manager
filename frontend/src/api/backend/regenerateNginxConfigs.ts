import * as api from "./base";
import type { NginxHostType, NginxRegenerateResult } from "./models";

/**
 * Rewrites the nginx config files of all enabled hosts from the database and reloads nginx once.
 * Admin only. Takes as long as testing every host with nginx, so there is no client timeout.
 */
export async function regenerateNginxConfigs(hostTypes?: NginxHostType[]): Promise<NginxRegenerateResult> {
	return await api.post({
		url: "/nginx/regenerate",
		// an explicit [] goes out as it is: the API refuses it (400), it must not mean "all types"
		data: hostTypes === undefined ? {} : { hostTypes },
	});
}
