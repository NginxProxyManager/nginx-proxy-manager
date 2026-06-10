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

const getFlagCodeForLocale = (locale?: string) => {
	const thisLocale = (locale || "en").slice(0, 2);

	// only add to this if your flag is different from the locale code
	const specialCases: Record<string, string> = {
		ja: "jp", // Japan
		zh: "cn", // China
		vi: "vn", // Vietnam
		ko: "kr", // Korea
		cs: "cz", // Czechia
		ga: "ie", // Ireland (Irish)
	};

	if (specialCases[thisLocale]) {
		return specialCases[thisLocale].toUpperCase();
	}
	return thisLocale.toUpperCase();
};

export { formatDateTime, parseDate, isUnixTimestamp, getFlagCodeForLocale };
