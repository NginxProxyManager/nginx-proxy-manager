import type { ReactNode } from "react";
import Alert from "react-bootstrap/Alert";
import { Loading, LoadingPage } from "src/components";
import { useUser } from "src/hooks";
import { T } from "src/locale";

interface Props {
	permission: string;
	type: "manage" | "view";
	hideError?: boolean;
	children?: ReactNode;
	pageLoading?: boolean;
	loadingNoLogo?: boolean;
}
function HasPermission({
	permission,
	type,
	children,
	hideError = false,
	pageLoading = false,
	loadingNoLogo = false,
}: Props) {
	const { data, isLoading } = useUser("me");
	const perms = data?.permissions;

	if (isLoading) {
		if (hideError) {
			return null;
		}
		if (pageLoading) {
			return <LoadingPage noLogo={loadingNoLogo} />;
		}
		return <Loading noLogo={loadingNoLogo} />;
	}

	let allowed = permission === "";
	const acceptable = ["manage", type];

	switch (permission) {
		case "admin":
			allowed = data?.roles?.includes("admin") || false;
			break;
		case "proxyHosts":
			allowed = acceptable.indexOf(perms?.proxyHosts || "") !== -1;
			break;
		case "redirectionHosts":
			allowed = acceptable.indexOf(perms?.redirectionHosts || "") !== -1;
			break;
		case "deadHosts":
			allowed = acceptable.indexOf(perms?.deadHosts || "") !== -1;
			break;
		case "streams":
			allowed = acceptable.indexOf(perms?.streams || "") !== -1;
			break;
		case "accessLists":
			allowed = acceptable.indexOf(perms?.accessLists || "") !== -1;
			break;
		case "certificates":
			allowed = acceptable.indexOf(perms?.certificates || "") !== -1;
			break;
	}

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
