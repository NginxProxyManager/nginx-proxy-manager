import cn from "classnames";
import { isPast, parseISO } from "date-fns";
import { DateTimeFormat } from "src/locale";

interface Props {
	value: string;
	highlightPast?: boolean;
}
export function DateFormatter({ value, highlightPast }: Props) {
	const dateIsPast = isPast(parseISO(value));
	const cl = cn({
		"text-danger": highlightPast && dateIsPast,
	});
	return <span className={cl}>{DateTimeFormat(value)}</span>;
}
