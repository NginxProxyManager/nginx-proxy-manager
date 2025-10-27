import cn from "classnames";
import { differenceInDays, isPast, parseISO } from "date-fns";
import { DateTimeFormat } from "src/locale";

interface Props {
	value: string;
	highlightPast?: boolean;
	highlistNearlyExpired?: boolean;
}
export function DateFormatter({ value, highlightPast, highlistNearlyExpired }: Props) {
	const dateIsPast = isPast(parseISO(value));
	const days = differenceInDays(parseISO(value), new Date());
	const cl = cn({
		"text-danger": highlightPast && dateIsPast,
		"text-warning": highlistNearlyExpired && !dateIsPast && days <= 30 && days >= 0,
	});
	return <span className={cl}>{DateTimeFormat(value)}</span>;
}
