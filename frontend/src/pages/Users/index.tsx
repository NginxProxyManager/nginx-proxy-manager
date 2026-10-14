import { HasPermission } from "src/components";
import { ADMIN, VIEW } from "src/modules/Permissions";
import Layout from "./Layout";

const Users = () => {
	return (
		<HasPermission section={ADMIN} permission={VIEW} pageLoading loadingNoLogo>
			<Layout />
		</HasPermission>
	);
};

export default Users;
