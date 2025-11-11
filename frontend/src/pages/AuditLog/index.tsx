import { HasPermission } from "src/components";
import { ADMIN, VIEW } from "src/modules/Permissions";
import TableWrapper from "./TableWrapper";

const AuditLog = () => {
	return (
		<HasPermission section={ADMIN} permission={VIEW} pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default AuditLog;
