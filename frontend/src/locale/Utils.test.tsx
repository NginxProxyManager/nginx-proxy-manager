import { formatDateTime, getFlagCodeForLocale, parseDate } from "src/locale";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("parseDate", () => {
	it.each([1, 1700000000, 1700000000.123, 9999999999])("parses %s as Unix seconds", (value) => {
		for (const input of [value, String(value)]) {
			expect(parseDate(input)?.getTime()).toBe(value * 1000);
		}
	});

	it.each([10000000000, 1700000000000, 1700000000123, 32503679999999])("parses %s as Unix milliseconds", (value) => {
		for (const input of [value, String(value)]) {
			expect(parseDate(input)?.getTime()).toBe(value);
		}
	});

	it("parses ISO dates with an explicit timezone", () => {
		expect(parseDate("2023-11-14T22:13:20.123Z")?.getTime()).toBe(1700000000123);
	});

	it.each([0, -100, -1700000000000, 32503680000000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
		"keeps %s outside the supported Unix timestamp range",
		(value) => {
			for (const input of [value, String(value)]) {
				expect(parseDate(input)?.getTime()).toBeNaN();
			}
		},
	);
});

describe("DateFormatter", () => {
	// Keep a reference to the real Intl to restore later
	const RealIntl = global.Intl;
	const desiredTimeZone = "Europe/London";
	const desiredLocale = "en-GB";

	beforeAll(() => {
		// Ensure Node-based libs using TZ behave deterministically
		try {
			process.env.TZ = desiredTimeZone;
		} catch {
			// ignore if not available
		}

		// Mock Intl.DateTimeFormat so formatting is stable regardless of host
		const MockedDateTimeFormat = class extends RealIntl.DateTimeFormat {
			constructor(_locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
				super(desiredLocale, {
					...options,
					timeZone: desiredTimeZone,
				});
			}
		} as unknown as typeof Intl.DateTimeFormat;

		global.Intl = {
			...RealIntl,
			DateTimeFormat: MockedDateTimeFormat,
		};
	});

	afterAll(() => {
		// Restore original Intl after tests
		global.Intl = RealIntl;
	});

	it("format date from iso date", () => {
		const value = "2024-01-01T00:00:00.000Z";
		const text = formatDateTime(value);
		expect(text).toBe("1 Jan 2024, 12:00:00 am");
	});

	it("format date from unix timestamp number", () => {
		const value = 1762476112;
		const text = formatDateTime(value);
		expect(text).toBe("7 Nov 2025, 12:41:52 am");
	});

	it("format date from unix timestamp string", () => {
		const value = "1762476112";
		const text = formatDateTime(value);
		expect(text).toBe("7 Nov 2025, 12:41:52 am");
	});

	it.each([1762476112000, "1762476112000"])("format date from millisecond timestamp %j", (value) => {
		expect(formatDateTime(value)).toBe("7 Nov 2025, 12:41:52 am");
	});

	it("catch bad format from string", () => {
		const value = "this is not a good date";
		const text = formatDateTime(value);
		expect(text).toBe("this is not a good date");
	});

	it("catch bad format from number", () => {
		const value = -100;
		const text = formatDateTime(value);
		expect(text).toBe("-100");
	});

	it("catch bad format from number as string", () => {
		const value = "-100";
		const text = formatDateTime(value);
		expect(text).toBe("-100");
	});
});

describe("getFlagCodeForLocale", () => {
	it("returns correct flag code for standard locales", () => {
		expect(getFlagCodeForLocale("en-US")).toBe("EN");
		expect(getFlagCodeForLocale("de-DE")).toBe("DE");
		expect(getFlagCodeForLocale("fr-FR")).toBe("FR");
	});

	it("returns correct flag code for special-case locales", () => {
		expect(getFlagCodeForLocale("ja-JP")).toBe("JP");
		expect(getFlagCodeForLocale("zh-CN")).toBe("CN");
		expect(getFlagCodeForLocale("vi-VN")).toBe("VN");
		expect(getFlagCodeForLocale("ko-KR")).toBe("KR");
		expect(getFlagCodeForLocale("cs-CZ")).toBe("CZ");
	});

	it("returns IE (Ireland) for Irish locale, not GA (Gabon)", () => {
		expect(getFlagCodeForLocale("ga-IE")).toBe("IE");
	});

	it("returns EE (Estonia) for Estonian locale, not ET (Ethiopia)", () => {
		expect(getFlagCodeForLocale("et")).toBe("EE");
		expect(getFlagCodeForLocale("et-EE")).toBe("EE");
	});

	it("falls back to EN when no locale is provided", () => {
		expect(getFlagCodeForLocale()).toBe("EN");
		expect(getFlagCodeForLocale(undefined)).toBe("EN");
	});
});

describe("formatDateTime Estonian locale", () => {
	it("uses 24-hour clock for et and et-EE", () => {
		const value = "2024-06-15T15:30:00.000Z";
		for (const locale of ["et", "et-EE"]) {
			const text = formatDateTime(value, locale);
			expect(text.toLowerCase()).not.toMatch(/\b(am|pm)\b/);
		}
	});
});
