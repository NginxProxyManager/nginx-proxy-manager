import * as api from "./base";
import type { LogChannel, LogHostType, LogSourceType, LogTail } from "./models";

export interface GetLogTailParams {
	type: LogSourceType;
	hostType?: LogHostType;
	hostId?: number;
	channel?: LogChannel;
	lines?: number;
	level?: string;
	search?: string;
}

export async function getLogTail(params: GetLogTailParams): Promise<LogTail> {
	return await api.get({
		url: "/logs/tail",
		params: { ...params },
	});
}
