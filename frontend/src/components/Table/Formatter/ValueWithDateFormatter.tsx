import type { ReactNode } from "react";
import { useLocaleState } from "src/context";
import { formatDateTime, T } from "src/locale";

interface Props {
	value: string;
	createdOn?: string;
	disabled?: boolean;
	suffix?: ReactNode;
}
export function ValueWithDateFormatter({ value, createdOn, disabled, suffix }: Props) {
	const { locale } = useLocaleState();
	return (
		<div className="flex-fill">
			<div className="font-weight-medium">
				<span className={`font-weight-medium ${disabled ? "text-red" : ""}`}>{value}</span>
				{suffix ? <> {suffix}</> : null}
			</div>
			{createdOn ? (
				<div className={`text-secondary mt-1 ${disabled ? "text-red" : ""}`}>
					<T id={disabled ? "disabled" : "created-on"} data={{ date: formatDateTime(createdOn, locale) }} />
				</div>
			) : null}
		</div>
	);
}
