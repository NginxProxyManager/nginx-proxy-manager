import { DateTimeFormat, intl } from "src/locale";

interface Props {
	value: string;
	createdOn?: string;
	disabled?: boolean;
}
export function ValueWithDateFormatter({ value, createdOn, disabled }: Props) {
	return (
		<div className="flex-fill">
			<div className="font-weight-medium">
				<div className={`font-weight-medium ${disabled ? "text-red" : ""}`}>{value}</div>
			</div>
			{createdOn ? (
				<div className={`text-secondary mt-1 ${disabled ? "text-red" : ""}`}>
					{disabled
						? intl.formatMessage({ id: "disabled" })
						: intl.formatMessage({ id: "created-on" }, { date: DateTimeFormat(createdOn) })}
				</div>
			) : null}
		</div>
	);
}
