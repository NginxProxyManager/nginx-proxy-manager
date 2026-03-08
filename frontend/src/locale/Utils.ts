import {
	fromUnixTime,
	type IntlFormatFormatOptions,
	intlFormat,
	parseISO,
} from "date-fns";

const isUnixTimestamp = (value: unknown): boolean => {
	if (typeof value !== "number" && typeof value !== "string") return false;
	const num = Number(value);
	if (!Number.isFinite(num)) return false;
	// Check plausible Unix timestamp range: from 1970 to ~year 3000
	// Support both seconds and milliseconds
	if (num > 0 && num < 10000000000) return true; // seconds (<= 10 digits)
	if (num >= 10000000000 && num < 32503680000000) return true; // milliseconds (<= 13 digits)
	return false;
};

const parseDate = (value: string | number): Date | null => {
	if (typeof value !== "number" && typeof value !== "string") return null;
	try {
		return isUnixTimestamp(value) ? fromUnixTime(+value) : parseISO(`${value}`);
	} catch {
		return null;
	}
};

const formatDateTime = (value: string | number, locale = "en-US"): string => {
	const d = parseDate(value);
	if (!d) return `${value}`;
	try {
		return intlFormat(
			d,
			{
				dateStyle: "medium",
				timeStyle: "medium",
				hourCycle: "h12",
			} as IntlFormatFormatOptions,
			{ locale },
		);
	} catch {
		return `${value}`;
	}
};

export { formatDateTime, parseDate, isUnixTimestamp };
