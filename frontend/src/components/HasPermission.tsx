import type { ReactNode } from "react";
import Alert from "react-bootstrap/Alert";
import { Loading, LoadingPage } from "src/components";
import { useUser } from "src/hooks";
import { T } from "src/locale";
import { hasCapability, hasPermission, type Permission, type Section } from "src/modules/Permissions";

interface Props {
	section?: Section;
	permission: Permission;
	hideError?: boolean;
	children?: ReactNode;
	pageLoading?: boolean;
	loadingNoLogo?: boolean;
	anyOf?: readonly string[];
}
function HasPermission({
	section,
	permission,
	children,
	hideError = false,
	pageLoading = false,
	loadingNoLogo = false,
	anyOf,
}: Props) {
	const { data, isLoading } = useUser("me");

	if (!section && !anyOf?.length) {
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

	const allowed = anyOf?.length
		? anyOf.some((capability) => hasCapability(data?.capabilities, capability))
		: hasPermission(section as Section, permission, data?.capabilities);
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
