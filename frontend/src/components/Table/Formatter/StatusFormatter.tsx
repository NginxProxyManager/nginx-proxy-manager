import cn from "classnames";
import { T } from "src/locale";

interface Props {
	enabled: boolean;
	nginxOnline?: boolean;
	nginxErr?: string | null;
}

export function StatusFormatter({ enabled, nginxOnline, nginxErr }: Props) {
	let color = "red";
	let label = "offline";

	if (!enabled) {
		color = "orange";
		label = "disabled";
	} else if (nginxOnline) {
		color = "lime";
		label = "online";
	}

	return (
		<span className={cn("status", `status-${color}`)} title={nginxErr ? nginxErr : undefined}>
			<span className="status-dot status-dot-animated" />
			<T id={label} />
		</span>
	);
}
