import cn from "classnames";
import { useLocaleState } from "src/context";
import { formatDateTime, T } from "src/locale";

interface Props {
	value: string;
	date?: number;
	disabled: boolean;
	langKey: string;
	langKeyNoDate: string;
}
export function ValueAndDateFormatter({ value, date, disabled, langKey, langKeyNoDate }: Props) {
	const { locale } = useLocaleState();
	return (
		<div className="flex-fill">
			<div className="font-weight-medium">
				<div
					className={cn("font-weight-medium", {
						"text-gray-500": disabled,
					})}
				>
					{value}
				</div>
			</div>
			{date ? (
				<div
					className={cn("text-secondary mt-1", {
						"text-grey-500": disabled,
					})}
					title={formatDateTime(date, locale)}
				>
					<T id={langKey} data={{ date: formatDateTime(date, locale, "relative") }} />
				</div>
			) : (
				<div
					className={cn("text-secondary mt-1", {
						"text-grey-500": disabled,
					})}
				>
					<T id={langKeyNoDate} />
				</div>
			)}
		</div>
	);
}
