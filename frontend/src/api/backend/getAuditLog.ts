import * as api from "./base";
import type { AuditLog } from "./models";

export async function getAuditLog(expand?: string[], params = {}): Promise<AuditLog[]> {
	return await api.get({
		url: "/audit-log",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
