import { formatDateTime } from "src/locale";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
