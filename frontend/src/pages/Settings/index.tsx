import Alert from "react-bootstrap/Alert";
import { LoadingPage } from "src/components";
import { useUser } from "src/hooks";
import { T } from "src/locale";
import { ADMIN, CREDENTIALS, hasPermission, VIEW } from "src/modules/Permissions";
import Layout from "./Layout";

const Settings = () => {
	const { data, isLoading } = useUser("me");

	if (isLoading) {
		return <LoadingPage noLogo />;
	}

	const canAccess =
		hasPermission(ADMIN, VIEW, data?.permissions, data?.roles) ||
		hasPermission(CREDENTIALS, VIEW, data?.permissions, data?.roles);

	if (!canAccess) {
		return (
			<Alert variant="danger">
				<T id="no-permission-error" />
			</Alert>
		);
	}

	return <Layout />;
};

export default Settings;
