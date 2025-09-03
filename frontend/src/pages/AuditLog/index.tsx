import { HasPermission } from "src/components";
import AuditTable from "./AuditTable";

const AuditLog = () => {
	return (
		<HasPermission permission="admin" type="manage" pageLoading loadingNoLogo>
			<AuditTable />
		</HasPermission>
	);
};

export default AuditLog;
