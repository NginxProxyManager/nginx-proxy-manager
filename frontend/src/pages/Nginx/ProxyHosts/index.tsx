import { HasPermission } from "src/components";
import TableWrapper from "./TableWrapper";

const ProxyHosts = () => {
	return (
		<HasPermission permission="proxyHosts" type="view" pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default ProxyHosts;
