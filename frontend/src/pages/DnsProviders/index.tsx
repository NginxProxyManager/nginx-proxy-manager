import { HasPermission } from "src/components";
import { ADMIN, VIEW } from "src/modules/Permissions";
import TableWrapper from "./TableWrapper";

const DnsProviders = () => {
	return (
		<HasPermission section={ADMIN} permission={VIEW} pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default DnsProviders;
