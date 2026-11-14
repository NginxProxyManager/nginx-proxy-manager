import cn from "classnames";
import type { ReactElement } from "react";
import { T } from "src/locale";

interface Props {
	value: boolean;
	count: number;
	disabled: boolean;
	translationKey: string;
	translationData?: Record<string, string | number | undefined>;
	enabledIcon: ReactElement<SVGSVGElement>;
	disabledIcon: ReactElement<SVGSVGElement>;
}
export function BooleanAsIconWithCountFormatter({
	value,
	count,
	disabled,
	translationKey,
	translationData,
	enabledIcon,
	disabledIcon,
}: Props) {
	return (
		<span>
			{value ? enabledIcon : disabledIcon}
			{count > 0 && (
				<span
					className={cn("p-2", {
						"text-gray-500": disabled,
					})}
				>
					<T id={translationKey} data={translationData} />
				</span>
			)}
		</span>
	);
}
