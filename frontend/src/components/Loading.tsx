import { intl } from "src/locale";
import styles from "./Loading.module.css";

interface Props {
	label?: string;
	noLogo?: boolean;
}
export function Loading({ label, noLogo }: Props) {
	return (
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
	);
}
