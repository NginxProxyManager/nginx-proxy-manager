import cn from "classnames";
import { T } from "src/locale";

interface Props {
	enabled: boolean;
}
export function EnabledFormatter({ enabled }: Props) {
	return (
		<span className={cn("badge", enabled ? "bg-lime-lt" : "bg-red-lt")}>
			<T id={enabled ? "enabled" : "disabled"} />
		</span>
	);
}
