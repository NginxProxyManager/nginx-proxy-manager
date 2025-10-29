import { HasPermission } from "src/components";
import TableWrapper from "./TableWrapper";

const Users = () => {
	return (
		<HasPermission permission="admin" type="manage" pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default Users;
