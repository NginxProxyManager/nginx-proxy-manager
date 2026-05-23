import * as api from "./base";
import type { AuditLogExpansion } from "./expansions";
import type { AuditLog } from "./models";

export async function getAuditLog(id: number, expand?: AuditLogExpansion[], params = {}): Promise<AuditLog> {
	return await api.get({
		url: `/audit-log/${id}`,
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
