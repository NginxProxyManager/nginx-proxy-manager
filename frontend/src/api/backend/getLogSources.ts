import * as api from "./base";
import type { LogSources } from "./models";

export async function getLogSources(): Promise<LogSources> {
	return await api.get({
		url: "/logs/sources",
	});
}
