import { fromUnixTime, intlFormat, parseISO } from "date-fns";

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

const DateTimeFormat = (value: string | number): string => {
	if (typeof value !== "number" && typeof value !== "string") return `${value}`;

	try {
		const d = isUnixTimestamp(value)
			? fromUnixTime(+value)
			: parseISO(`${value}`);
		return intlFormat(d, {
			weekday: "long",
			year: "numeric",
			month: "numeric",
			day: "numeric",
			hour: "numeric",
			minute: "numeric",
			second: "numeric",
			hour12: true,
		});
	} catch {
		return `${value}`;
	}
};

export { DateTimeFormat };
