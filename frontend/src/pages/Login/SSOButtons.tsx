import type { AuthProviders } from "src/api/backend";
import { T } from "src/locale";

interface Props {
	providers: AuthProviders;
	onAdministratorPassword: () => void;
}

export default function SSOButtons({ providers, onAdministratorPassword }: Props) {
	return (
		<div className="d-grid gap-2">
			{providers.connections.map((connection) => (
				<a
					key={connection.id}
					className="btn btn-outline-primary"
					href={`/sso/${encodeURIComponent(connection.id)}/start`}
				>
					{connection.name}
				</a>
			))}
			{providers.mode === "sso_only" && providers.passwordLoginAvailable ? (
				<button className="btn btn-link" type="button" onClick={onAdministratorPassword}>
					<T id="login.sso-administrator-password" />
				</button>
			) : null}
		</div>
	);
}
