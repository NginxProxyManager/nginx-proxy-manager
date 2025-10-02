import cn from "classnames";
import { T } from "src/locale";

interface Props {
	enabled: boolean;
}
export function StatusFormatter({ enabled }: Props) {
	return (
		<span className={cn("badge", enabled ? "bg-lime-lt" : "bg-red-lt")}>
			<T id={enabled ? "online" : "offline"} />
		</span>
	);
}
