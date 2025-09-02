import { intlFormat, parseISO } from "date-fns";
import { intl } from "src/locale";

interface Props {
	value: string;
	createdOn?: string;
}
export function ValueWithDateFormatter({ value, createdOn }: Props) {
	return (
		<div className="flex-fill">
			<div className="font-weight-medium">
				<div className="font-weight-medium">{value}</div>
			</div>
			{createdOn ? (
				<div className="text-secondary mt-1">
					{intl.formatMessage({ id: "created-on" }, { date: intlFormat(parseISO(createdOn)) })}
				</div>
			) : null}
		</div>
	);
}
