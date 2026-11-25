import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DomainsFormatter } from "./DomainsFormatter";

vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en" }) }));

afterEach(cleanup);

it.each([
	[undefined, "http://example.com"],
	[4443, "https://example.com:4443/"],
	[443, "https://example.com/"],
])("formats the domain link with HTTPS port %s", (httpsPort, href) => {
	render(<DomainsFormatter domains={["example.com"]} httpsPort={httpsPort} />);
	expect(screen.getByRole("link", { name: "example.com" })).toHaveAttribute("href", href);
});

it("keeps wildcard domains from navigating with a configured HTTPS port", () => {
	render(<DomainsFormatter domains={["*.example.com"]} httpsPort={4443} />);
	expect(fireEvent.click(screen.getByRole("link", { name: "*.example.com" }))).toBe(false);
});
