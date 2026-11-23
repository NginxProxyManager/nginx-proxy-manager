import { HasPermission } from "src/components";
import { ADMIN, VIEW } from "src/modules/Permissions";
import LogViewer from "./LogViewer";

const Logs = () => {
	return (
		<HasPermission section={ADMIN} permission={VIEW} pageLoading loadingNoLogo>
			<LogViewer />
		</HasPermission>
	);
};

export default Logs;
