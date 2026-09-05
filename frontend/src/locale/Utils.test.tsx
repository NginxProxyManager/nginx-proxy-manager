import { cleanup, render, screen } from "@testing-library/react";
import { changeLocale, formatDateTime, getFlagCodeForLocale, getLocale, localeOptions, T } from "src/locale";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

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

	it("falls back to EN when no locale is provided", () => {
		expect(getFlagCodeForLocale()).toBe("EN");
		expect(getFlagCodeForLocale(undefined)).toBe("EN");
	});
});

describe("locale runtime", () => {
	it("reads, changes, and falls back across supported and unsupported locales", () => {
		window.localStorage.removeItem("locale");
		document.documentElement.lang = "en-US";
		expect(getLocale()).toBe("en-US");
		expect(getLocale(true)).toBe("en");
		changeLocale("zh-CN");
		expect(window.localStorage.getItem("locale")).toBe("zh-CN");
		expect(document.documentElement.lang).toBe("zh-CN");
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		changeLocale("xx-XX");
		consoleError.mockRestore();
		expect(getLocale()).toBe("xx-XX");
		expect(localeOptions.length).toBeGreaterThan(20);
	});

	it("renders translated parameters and translated object names", () => {
		changeLocale("en");
		render(<T id="object.add" data={{ count: 2 }} tData={{ object: "proxy-host" }} />);
		expect(screen.getByText(/Add Proxy Host/i)).toHaveAttribute("data-translation-id", "object.add");
	});
});
