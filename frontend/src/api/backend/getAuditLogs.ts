import * as api from "./base";
import type { AuditLog } from "./models";

export type AuditLogExpansion = "user";

export async function getAuditLogs(expand?: AuditLogExpansion[], params = {}): Promise<AuditLog[]> {
	return await api.get({
		url: "/audit-log",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
