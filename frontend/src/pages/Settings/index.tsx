import { HasPermission } from "src/components";
import { SETTINGS, VIEW } from "src/modules/Permissions";
import Layout from "./Layout";

const Settings = () => {
	return (
		<HasPermission section={SETTINGS} permission={VIEW} pageLoading loadingNoLogo>
			<Layout />
		</HasPermission>
	);
};

export default Settings;
