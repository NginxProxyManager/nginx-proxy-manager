import type { ReactNode } from "react";
import Alert from "react-bootstrap/Alert";
import { useUser } from "src/hooks";
import { intl } from "src/locale";

interface Props {
	permission: string;
	type: "manage" | "view";
	hideError?: boolean;
	children?: ReactNode;
}
function HasPermission({ permission, type, children, hideError = false }: Props) {
	const { data } = useUser("me");
	const perms = data?.permissions;

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

	return !hideError ? <Alert variant="danger">{intl.formatMessage({ id: "no-permission-error" })}</Alert> : null;
}

export { HasPermission };
