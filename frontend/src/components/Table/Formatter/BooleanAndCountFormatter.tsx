import { IconLock, IconShieldCheckFilled } from "@tabler/icons-react";
import cn from "classnames";
import { T } from "src/locale";

interface Props {
	value: boolean;
	count: number;
	disabled: boolean;
	translationKey: string;
}
export function BooleanAndCountFormatter({ value, count, disabled, translationKey }: Props) {
	const enabledColor = disabled ? "opacity-30" : "text-lime opacity-85";
	const disabledColor = disabled ? "opacity-30" : "opacity-65";
	return (
		<span>
			{value ? <IconShieldCheckFilled className={enabledColor} /> : <IconLock className={disabledColor} />}
			{count > 0 && (
				<span
					className={cn("p-2", {
						"text-gray-500": disabled,
					})}
				>
					<T id={translationKey} data={{ count }} />
				</span>
			)}
		</span>
	);
}
