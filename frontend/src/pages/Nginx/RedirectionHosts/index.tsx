import { HasPermission } from "src/components";
import TableWrapper from "./TableWrapper";

const RedirectionHosts = () => {
	return (
		<HasPermission permission="redirectionHosts" type="view" pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default RedirectionHosts;
