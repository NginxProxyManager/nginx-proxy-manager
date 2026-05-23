import type { ReactNode } from "react";
import Alert from "react-bootstrap/Alert";
import { Loading, LoadingPage } from "src/components";
import { useUser } from "src/hooks";
import { T } from "src/locale";
import { type ADMIN, hasPermission, type Permission, type Section } from "src/modules/Permissions";

interface Props {
	section?: Section | typeof ADMIN;
	permission: Permission;
	hideError?: boolean;
	children?: ReactNode;
	pageLoading?: boolean;
	loadingNoLogo?: boolean;
}
function HasPermission({
	section,
	permission,
	children,
	hideError = false,
	pageLoading = false,
	loadingNoLogo = false,
}: Props) {
	const { data, isLoading } = useUser("me");

	if (!section) {
		return <>{children}</>;
	}

	if (isLoading) {
		if (hideError) {
			return null;
		}
		if (pageLoading) {
			return <LoadingPage noLogo={loadingNoLogo} />;
		}
		return <Loading noLogo={loadingNoLogo} />;
	}

	const allowed = hasPermission(section, permission, data?.permissions, data?.roles);
	if (allowed) {
		return <>{children}</>;
	}

	return !hideError ? (
		<Alert variant="danger">
			<T id="no-permission-error" />
		</Alert>
	) : null;
}

export { HasPermission };
