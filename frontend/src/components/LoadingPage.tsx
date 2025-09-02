import { Page } from "src/components";
import { intl } from "src/locale";
import styles from "./LoadingPage.module.css";

interface Props {
	label?: string;
	noLogo?: boolean;
}
export function LoadingPage({ label, noLogo }: Props) {
	return (
		<Page className="page-center">
			<div className="container-tight py-4">
				<div className="empty text-center">
					{noLogo ? null : (
						<div className="mb-3">
							<img className={styles.logo} src="/images/logo-no-text.svg" alt="" />
						</div>
					)}
					<div className="text-secondary mb-3">{label || intl.formatMessage({ id: "loading" })}</div>
					<div className="progress progress-sm">
						<div className="progress-bar progress-bar-indeterminate" />
					</div>
				</div>
			</div>
		</Page>
	);
}
