import * as api from "./base";
import type { TrafficReport } from "./models";

export interface TrafficReportQuery {
	hours?: number;
	hostType?: string;
	hostId?: number;
}

export async function getTrafficReport({ hours, hostType, hostId }: TrafficReportQuery = {}): Promise<TrafficReport> {
	return await api.get({
		url: "/reports/traffic",
		params: { hours, hostType, hostId },
	});
}
