import { HasPermission } from "src/components";
import { REDIRECTION_HOSTS, VIEW } from "src/modules/Permissions";
import TableWrapper from "./TableWrapper";

const RedirectionHosts = () => {
	return (
		<HasPermission section={REDIRECTION_HOSTS} permission={VIEW} pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default RedirectionHosts;
