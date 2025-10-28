import { HasPermission } from "src/components";
import Layout from "./Layout";

const Settings = () => {
	return (
		<HasPermission permission="admin" type="manage" pageLoading loadingNoLogo>
			<Layout />
		</HasPermission>
	);
};

export default Settings;
