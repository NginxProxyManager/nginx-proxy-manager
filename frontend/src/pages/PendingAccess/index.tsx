import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { Button, LocalePicker, Page, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { T } from "src/locale";

interface Props {
	profileUnavailable?: boolean;
}

export default function PendingAccess({ profileUnavailable = false }: Props) {
	const { logout } = useAuthState();
	const [logoutUnconfirmed, setLogoutUnconfirmed] = useState(false);
	const [loggingOut, setLoggingOut] = useState(false);

	const onLogout = async () => {
		setLoggingOut(true);
		try {
			await logout();
		} catch {
			setLogoutUnconfirmed(true);
		} finally {
			setLoggingOut(false);
		}
	};

	return (
		<Page className="page page-center">
			<div className="container container-tight py-4">
				<div className="d-flex justify-content-end gap-1 mb-3">
					<LocalePicker />
					<ThemeSwitcher />
				</div>
				<div className="card card-md">
					<div className="card-body text-center">
						<h2 className="h2"><T id="pending-access.title" /></h2>
						<p className="text-secondary">
							<T id={profileUnavailable ? "pending-access.profile-unavailable" : "pending-access.description"} />
						</p>
						{logoutUnconfirmed ? (
							<Alert variant="warning"><T id="logout.unconfirmed" /></Alert>
						) : null}
						<Button color="azure" onClick={onLogout} isLoading={loggingOut}>
							<T id="user.logout" />
						</Button>
					</div>
				</div>
			</div>
		</Page>
	);
}
