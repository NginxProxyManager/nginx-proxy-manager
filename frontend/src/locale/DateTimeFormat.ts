import { intlFormat, parseISO } from "date-fns";

const DateTimeFormat = (isoDate: string) =>
	intlFormat(parseISO(isoDate), {
		weekday: "long",
		year: "numeric",
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
		second: "numeric",
		hour12: true,
	});

export { DateTimeFormat };
