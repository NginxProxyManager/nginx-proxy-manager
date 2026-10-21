import { Loading, LocalePicker, Page, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { useHealth } from "src/hooks";
import Cookies from "universal-cookie";
import styles from "./index.module.css";

function OAuth2SuccessContent() {
	// read oauth callback state cookies
	const cookies = new Cookies();
	const token = cookies.get("npm_sso_t");
	const expiry = cookies.get("npm_sso_e");
	const expiryTime = new Date(decodeURIComponent(expiry || "")).getTime();

	// register a newly acquired jwt token following successful oidc authentication
	useAuthState()
		.loginSingleSignOnUser(token, expiryTime)
		.finally(() => {
			// remove temporary cookies related to OAuth flow
			cookies.remove("npm_sso_s", { path: "/" });
			cookies.remove("npm_sso_n", { path: "/" });
			cookies.remove("npm_sso_t", { path: "/" });
			cookies.remove("npm_sso_e", { path: "/" });
		});

	return (
		<div>
			<Loading noLogo label={"Authentication in progress..."} />
		</div>
	);
}

export default function OAuth2Success() {
	const health = useHealth();

	const getVersion = () => {
		if (!health.data) {
			return "";
		}
		const v = health.data.version;
		return `v${v.major}.${v.minor}.${v.revision}`;
	};

	return (
		<Page className="page page-center">
			<div className="container container-tight py-4">
				<div className="d-flex justify-content-between align-items-center mb-4 ps-4 pe-3">
					<img
						className={styles.logo}
						src="/images/logo-text-horizontal-grey.png"
						alt="Nginx Proxy Manager"
					/>
					<div className="d-flex align-items-center gap-1">
						<LocalePicker />
						<ThemeSwitcher />
					</div>
				</div>
				<div className="card card-md">
					<div className="card-body">{<OAuth2SuccessContent />}</div>
				</div>
				<div className="text-center text-secondary mt-3">{getVersion()}</div>
			</div>
		</Page>
	);
}
