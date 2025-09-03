import { HasPermission } from "src/components";
import TableWrapper from "./TableWrapper";

const DeadHosts = () => {
	return (
		<HasPermission permission="deadHosts" type="view" pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default DeadHosts;
