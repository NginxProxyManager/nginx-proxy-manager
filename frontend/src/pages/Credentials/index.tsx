import { HasPermission } from "src/components";
import { CREDENTIALS, VIEW } from "src/modules/Permissions";
import TableWrapper from "./TableWrapper";

const Credentials = () => (
	<HasPermission section={CREDENTIALS} permission={VIEW} pageLoading loadingNoLogo>
		<TableWrapper />
	</HasPermission>
);

export default Credentials;
