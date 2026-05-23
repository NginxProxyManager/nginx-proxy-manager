import { useQuery } from "@tanstack/react-query";
import { type AuditLog, getAuditLog } from "src/api/backend";

const fetchAuditLog = (id: number) => {
	return getAuditLog(id, ["user"]);
};

const useAuditLog = (id: number, options = {}) => {
	return useQuery<AuditLog, Error>({
		queryKey: ["audit-log", id],
		queryFn: () => fetchAuditLog(id),
		staleTime: 5 * 60 * 1000, // 5 minutes
		...options,
	});
};

export { useAuditLog };
