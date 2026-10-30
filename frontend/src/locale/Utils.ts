import { fromUnixTime, type IntlFormatFormatOptions, intlFormat, parseISO } from "date-fns";

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

const DATE_LOCALE_BY_LANG: Record<string, string> = {
	et: "et-EE",
};

const HOUR_CYCLE_BY_LANG: Record<string, "h12" | "h23"> = {
	et: "h23",
};

const formatDateTime = (
	value: string | number,
	locale = "en-US",
	perspective: "relative" | "absolute" = "absolute",
): string => {
	const d = parseDate(value);
	if (!d) return `${value}`;
	const lang = (locale || "en").slice(0, 2);
	const resolvedLocale = DATE_LOCALE_BY_LANG[lang] || locale;
	const hourCycle = HOUR_CYCLE_BY_LANG[lang] || "h12";

	if (perspective === "relative") {
		const timeAgo = formatRelativePastMonth(d, resolvedLocale);
		if (timeAgo) {
			return timeAgo;
		}
	}

	try {
		return intlFormat(
			d,
			{
				dateStyle: "medium",
				timeStyle: "medium",
				hourCycle,
			} as IntlFormatFormatOptions,
			{ locale: resolvedLocale },
		);
	} catch {
		return `${value}`;
	}
};

const formatRelativePastMonth = (date: Date, locale: string) => {
	if (date.getTime() > Date.now()) return; // return early for future dates fallback
	const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	const seconds = Math.floor((date.getTime() - Date.now()) / 1000);
	const minutes = Math.ceil(seconds / 60);
	const hours = Math.ceil(minutes / 60);
	const days = Math.ceil(hours / 24);

	if (minutes === 0) {
		return rel.format(seconds, "seconds");
	}
	if (minutes > -60) {
		return rel.format(minutes, "minutes");
	}
	if (minutes > -60 * 24) {
		return rel.format(hours, "hours");
	}
	if (minutes > -60 * 24 * 30) {
		return rel.format(days, "days");
	}
	// fallback beyond 30 days
};

export { formatDateTime, parseDate, isUnixTimestamp };
