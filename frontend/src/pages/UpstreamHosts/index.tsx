import { HasPermission } from "src/components";
import { UPSTREAM_HOSTS, VIEW } from "src/modules/Permissions";
import TableWrapper from "./TableWrapper";

const UpstreamHosts = () => {
	return (
		<HasPermission section={UPSTREAM_HOSTS} permission={VIEW} pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default UpstreamHosts;
