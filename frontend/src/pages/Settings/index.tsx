import { HasPermission } from "src/components";
import SettingTable from "./SettingTable";

const Settings = () => {
	return (
		<HasPermission permission="admin" type="manage" pageLoading loadingNoLogo>
			<SettingTable />
		</HasPermission>
	);
};

export default Settings;
