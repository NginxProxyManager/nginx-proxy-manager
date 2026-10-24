import { HasPermission } from "src/components";
import { AUDIT_LOG, VIEW } from "src/modules/Permissions";
import TableWrapper from "./TableWrapper";

const AuditLog = () => {
	return (
		<HasPermission section={AUDIT_LOG} permission={VIEW} pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default AuditLog;
