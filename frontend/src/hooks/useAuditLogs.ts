import { useQuery } from "@tanstack/react-query";
import { type AuditLog, type AuditLogExpansion, getAuditLogs } from "src/api/backend";

const fetchAuditLogs = (expand?: AuditLogExpansion[]) => {
	return getAuditLogs(expand);
};

const useAuditLogs = (expand?: AuditLogExpansion[], options = {}) => {
	return useQuery<AuditLog[], Error>({
		queryKey: ["audit-logs", { expand }],
		queryFn: () => fetchAuditLogs(expand),
		staleTime: 10 * 1000,
		...options,
	});
};

export { fetchAuditLogs, useAuditLogs };
