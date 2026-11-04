import * as api from "./base";
import type { UpstreamHealth } from "./models";

export async function getUpstreamHealth(abortController?: AbortController): Promise<UpstreamHealth> {
	return await api.get({ url: "/upstreams/health" }, abortController);
}
