import cn from "classnames";
import { T } from "src/locale";

interface Props {
	value: boolean;
	trueLabel?: string;
	trueColor?: string;
	falseLabel?: string;
	falseColor?: string;
}
export function TrueFalseFormatter({
	value,
	trueLabel = "enabled",
	trueColor = "lime",
	falseLabel = "disabled",
	falseColor = "red",
}: Props) {
	return (
		<span className={cn("status", `status-${value ? trueColor : falseColor}`)}>
			<span className="status-dot status-dot-animated" />
			<T id={value ? trueLabel : falseLabel} />
		</span>
	);
}
