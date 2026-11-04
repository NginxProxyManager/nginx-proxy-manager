import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DomainsFormatter } from "./DomainsFormatter";

const { health } = vi.hoisted(() => ({ health: { publicPorts: { http: 232, https: 233 } } }));
vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en" }) }));
vi.mock("src/hooks/useHealth", () => ({ useHealth: () => ({ data: health }) }));
vi.mock("src/locale", () => ({ formatDateTime: () => "", T: () => null }));

afterEach(cleanup);

describe("public host links", () => {
	it.each([
		["https", 232, 233, "example.com:233", "https://example.com:233"],
		["http", 232, 233, "example.com:232", "http://example.com:232"],
		["https", 80, 443, "example.com", "https://example.com"],
		["http", 80, 443, "example.com", "http://example.com"],
	] as const)("formats %s with HTTP %s / HTTPS %s", (scheme, http, https, text, href) => {
		health.publicPorts = { http, https };
		render(<DomainsFormatter domains={["example.com"]} linkScheme={scheme} />);
		const link = screen.getByRole("link", { name: text });
		expect(link.getAttribute("href")).toBe(href);
	});

	it("preserves certificate-list links that have no host scheme", () => {
		health.publicPorts = { http: 232, https: 233 };
		render(<DomainsFormatter domains={["example.com"]} />);
		expect(screen.getByRole("link", { name: "example.com" }).getAttribute("href")).toBe("http://example.com");
	});

	it("keeps wildcard links non-navigable", () => {
		health.publicPorts = { http: 232, https: 233 };
		render(<DomainsFormatter domains={["*.example.com"]} linkScheme="https" />);
		expect(fireEvent.click(screen.getByRole("link", { name: "*.example.com:233" }))).toBe(false);
	});
});
