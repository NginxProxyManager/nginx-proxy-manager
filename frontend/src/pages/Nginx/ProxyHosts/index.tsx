import { HasPermission } from "src/components";
import { PROXY_HOSTS, VIEW } from "src/modules/Permissions";
import TableWrapper from "./TableWrapper";

const ProxyHosts = () => {
	return (
		<HasPermission section={PROXY_HOSTS} permission={VIEW} pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default ProxyHosts;
