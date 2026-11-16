import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { HostMeta, NginxConfigErrorDetails, NginxLocationStatus } from "src/api/backend";
import { changeLocale, intl, T } from "src/locale";
import { locationStatusText } from "src/modules/HostStatus";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveWarning } from "./NginxFeedback";
import { LocationStatusBadge } from "./StatusBadges";
import { HostStatusFormatter } from "./Table/Formatter/HostStatusFormatter";

// The state of a custom location is worded from the backend's code and params in the UI language; only nginx's own
// error text is shown as it is. Languages without a text for a key fall back to English.

vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "de" }) }));

const NGINX_TEXT = 'Unknown directive "proxy_passs".';

const quarantined: NginxLocationStatus = {
	index: 1,
	path: "/api",
	status: "quarantined",
	mode: null,
	code: "rejected",
	params: { detail: NGINX_TEXT },
	message: `Disabled because nginx rejected it: ${NGINX_TEXT}`,
};
const unresolved: NginxLocationStatus = {
	index: 2,
	path: "/old",
	status: "unresolved",
	mode: "dynamic",
	code: "unresolved",
	params: { host: "ghost" },
	message: 'Host "ghost" can\'t be resolved right now. Requests to this location fail with 502 until it resolves.',
};
const meta: HostMeta = { nginxOnline: true, nginxLocations: [quarantined, unresolved] };

const openPopover = async () => {
	render(<HostStatusFormatter enabled meta={meta} />);
	fireEvent.click(screen.getByRole("button"));
	return screen.findByTestId("host-status-popover");
};

describe("custom location states in the UI language", () => {
	afterEach(() => {
		cleanup();
		changeLocale("en");
	});

	it("German: translated text, nginx's error as an untranslated detail", async () => {
		changeLocale("de");
		const popover = await openPopover();
		expect(popover).toHaveTextContent("Nginx hat diese Location abgelehnt, daher wurde sie deaktiviert.");
		expect(popover).toHaveTextContent(NGINX_TEXT);
		expect(popover).toHaveTextContent('Der Host "ghost" kann gerade nicht aufgelöst werden.');
		expect(popover).not.toHaveTextContent("Disabled because nginx rejected it");
		expect(popover).not.toHaveTextContent("can't be resolved");
	});

	it("German: every check of the backend has a text", () => {
		changeLocale("de");
		for (const code of [
			"empty_path",
			"empty_host",
			"invalid_host",
			"invalid_path",
			"unbalanced_braces",
			"regex_forward_path",
			"named_forward_path",
			"unresolved",
			"rejected",
			"omitted",
		]) {
			const { text } = locationStatusText({
				status: "quarantined",
				code,
				params: { host: "h" },
				message: "English",
			});
			expect(text, code).not.toBe("English");
			expect(text, code).not.toMatch(/\{|location-check/);
		}
	});

	it("German: the save warning and the editor badge", async () => {
		changeLocale("de");
		render(<SaveWarning meta={meta} onClose={() => {}} />);
		const warning = screen.getByTestId("save-warning");
		expect(warning).toHaveTextContent("1 benutzerdefinierte Location wurde deaktiviert");
		expect(warning).toHaveTextContent("Nginx hat diese Location abgelehnt");
		expect(warning).toHaveTextContent(NGINX_TEXT);
		expect(warning).not.toHaveTextContent("Disabled because");

		render(<LocationStatusBadge id="b" status="quarantined" location={quarantined} />);
		fireEvent.focus(screen.getByText("Nicht aktiv").closest("[tabindex]") as HTMLElement);
		const tip = await screen.findByRole("tooltip");
		expect(tip).toHaveTextContent("Nginx hat diese Location abgelehnt");
		expect(tip).toHaveTextContent(NGINX_TEXT);
	});

	it("Japanese (no texts of its own): the English text of the code, nginx's error as a detail, 1 location", async () => {
		changeLocale("ja");
		const popover = await openPopover();
		expect(popover).toHaveTextContent("Nginx rejected this location, so it was disabled.");
		expect(popover).toHaveTextContent(NGINX_TEXT);
		expect(popover).not.toHaveTextContent("Disabled because nginx rejected it");
		cleanup();

		// ja has no "one" plural category: the English fallback still reads "1 location", not "1 locations"
		expect(intl.formatMessage({ id: "locations.count" }, { count: 1 })).toBe("+1 location");
		expect(intl.formatMessage({ id: "locations.count" }, { count: 2 })).toBe("+2 locations");
		expect(intl.formatMessage({ id: "locations.problems" }, { count: 1 })).toBe("1 problem");
		render(<SaveWarning meta={meta} onClose={() => {}} />);
		const warning = screen.getByTestId("save-warning");
		expect(warning).toHaveTextContent("1 custom location was disabled because nginx rejected it.");
		expect(warning).toHaveTextContent("1 custom location points to a host that can't be resolved right now.");
		cleanup();
		render(<T id="locations.count" data={{ count: 1 }} />);
		expect(screen.getByText("+1 location")).toBeInTheDocument();
	});

	it("a host offline because of a location error: translated prefix with the path, nginx's error as it is", async () => {
		const details: NginxConfigErrorDetails = {
			kind: "nginx_config",
			scope: "host",
			area: "location_advanced",
			relativeLine: 2,
			locationIndex: 1,
			locationPath: "/api",
			detail: NGINX_TEXT,
			hintCode: "unknown_directive",
		};
		const offline: HostMeta = {
			nginxOnline: false,
			nginxErr: 'Custom location "/api" advanced configuration: unknown directive "proxy_passs" (line 2).',
			nginxDetails: details,
		};
		const open = async () => {
			render(<HostStatusFormatter enabled meta={offline} />);
			fireEvent.click(screen.getByRole("button"));
			return screen.findByTestId("host-status-popover");
		};

		changeLocale("de");
		let popover = await open();
		expect(popover).toHaveTextContent(
			"Fehler in der benutzerdefinierten Nginx-Konfiguration der Location /api, Zeile 2",
		);
		expect(popover).toHaveTextContent(NGINX_TEXT);
		expect(popover).not.toHaveTextContent("Custom location");
		cleanup();

		// ja has none of these texts: the English one, worded from the details
		changeLocale("ja");
		popover = await open();
		expect(popover).toHaveTextContent(
			"Error in the custom Nginx configuration of the custom location /api, line 2",
		);
		expect(popover).toHaveTextContent(NGINX_TEXT);
		cleanup();

		changeLocale("de");
		render(
			<SaveWarning
				meta={{ ...offline, nginxDetails: { ...details, area: "location", relativeLine: null } }}
				onClose={() => {}}
			/>,
		);
		expect(screen.getByTestId("save-warning")).toHaveTextContent("Fehler in der benutzerdefinierten Location /api");
	});

	it("an unknown code shows the backend's message, no code its state's default", () => {
		changeLocale("de");
		expect(
			locationStatusText({ status: "quarantined", code: "something_new", params: null, message: "Backend text" }),
		).toEqual({ text: "Backend text", detail: null });
		expect(locationStatusText({ status: "unresolved", code: null, params: null, message: null }).text).toBe(
			"Der Ziel-Host kann gerade nicht aufgelöst werden. Anfragen an diese Location schlagen fehl, bis er erreichbar ist.",
		);
	});
});
