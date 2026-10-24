import { HasPermission } from "src/components";
import { USERS, VIEW } from "src/modules/Permissions";
import TableWrapper from "./TableWrapper";

const Users = () => {
	return (
		<HasPermission section={USERS} permission={VIEW} pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default Users;
