import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ApiError, type HostMeta, type NginxConfigErrorDetails } from "src/api/backend";
import { changeLocale } from "src/locale";
import { describeNginxError, formatApiError } from "src/modules/HostStatus";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NginxErrorMessage, SaveWarning } from "./NginxFeedback";
import { HostStatusFormatter } from "./Table/Formatter/HostStatusFormatter";

// An nginx error is worded in the UI language from the backend's details: where it is and what kind it is are
// translated, nginx's own (humanised) error is shown as it is. The English message is only the fallback.

vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "de" }) }));

const NGINX_TEXT = 'Unknown directive "proxy_passs".';
const ENGLISH = 'Advanced configuration: unknown directive "proxy_passs" (line 3).';

const advanced: NginxConfigErrorDetails = {
	kind: "nginx_config",
	scope: "host",
	hostType: "proxy_host",
	hostId: 4,
	file: "/data/nginx/proxy_host/4.conf",
	line: 31,
	nginxOutput: "nginx: [emerg] unknown directive",
	hint: "Check the spelling of the directive. If it comes from an nginx module, that module may not be available.",
	hintCode: "unknown_directive",
	area: "host_advanced",
	relativeLine: 3,
	detail: NGINX_TEXT,
};
const meta: HostMeta = { nginxOnline: false, nginxErr: ENGLISH, nginxDetails: advanced };

const openPopover = async (m: HostMeta) => {
	render(<HostStatusFormatter enabled meta={m} />);
	fireEvent.click(screen.getByRole("button"));
	return screen.findByTestId("host-status-popover");
};

describe("nginx errors in the UI language", () => {
	afterEach(() => {
		cleanup();
		changeLocale("en");
	});

	it("English: worded from the details, nginx's error below", () => {
		expect(describeNginxError(advanced)).toEqual({
			text: "Error in the custom Nginx configuration, line 3",
			detail: NGINX_TEXT,
			hint: advanced.hint,
		});
	});

	it("German: host status popover with the translated prefix and nginx's error as it is", async () => {
		changeLocale("de");
		const popover = await openPopover(meta);
		expect(popover).toHaveTextContent("Fehler in der benutzerdefinierten Nginx-Konfiguration, Zeile 3");
		expect(popover).toHaveTextContent(NGINX_TEXT);
		expect(popover).not.toHaveTextContent("Advanced configuration");
	});

	it("Japanese (no text of its own for these keys): English prefix from the details, nginx's error", async () => {
		changeLocale("ja");
		const popover = await openPopover(meta);
		expect(popover).toHaveTextContent("Error in the custom Nginx configuration, line 3");
		expect(popover).toHaveTextContent(NGINX_TEXT);
		expect(popover).not.toHaveTextContent("nginx-error.");
	});

	it("German: save warning and modal error with a translated hint", () => {
		changeLocale("de");
		render(<SaveWarning meta={meta} onClose={() => {}} />);
		const warning = screen.getByTestId("save-warning");
		expect(warning).toHaveTextContent("Fehler in der benutzerdefinierten Nginx-Konfiguration, Zeile 3");
		expect(warning).toHaveTextContent(NGINX_TEXT);
		cleanup();
		render(<NginxErrorMessage message={ENGLISH} details={advanced} />);
		const error = screen.getByTestId("nginx-error");
		expect(error).toHaveTextContent("Fehler in der benutzerdefinierten Nginx-Konfiguration, Zeile 3");
		expect(error).toHaveTextContent("Prüfe die Schreibweise der Direktive.");
		expect(error).not.toHaveTextContent(ENGLISH);
	});

	it("German: the save warning and the status popover of an offline host show the recovery hint", async () => {
		changeLocale("de");
		render(<SaveWarning meta={meta} onClose={() => {}} />);
		expect(screen.getByTestId("save-warning")).toHaveTextContent("Prüfe die Schreibweise der Direktive.");
		cleanup();
		const popover = await openPopover(meta);
		expect(popover).toHaveTextContent("Prüfe die Schreibweise der Direktive.");
	});

	it("English: the status popover shows the hint of a certificate that can't be loaded", async () => {
		const popover = await openPopover({
			nginxOnline: false,
			nginxErr: "Cannot load certificate.",
			nginxDetails: {
				kind: "nginx_config",
				scope: "host",
				detail: "Cannot load certificate",
				hintCode: "certificate_load",
			},
		});
		expect(popover).toHaveTextContent(/Cannot load certificate/);
		expect(popover).toHaveTextContent("Select another certificate or renew it.");
	});

	it("German: an offline host whose previous config nginx still runs says so", async () => {
		changeLocale("de");
		const running: HostMeta = {
			nginxOnline: false,
			nginxErr: "unsafe",
			nginxDetails: { kind: "unsafe_value", scope: "host", detail: '"a b"', previousConfigRunning: true },
		};
		render(<SaveWarning meta={running} onClose={() => {}} />);
		const warning = screen.getByTestId("save-warning");
		expect(warning).toHaveTextContent(
			"Gespeichert, aber nginx hat die Änderung nicht übernommen und führt weiter die vorherige Konfiguration dieses Hosts aus:",
		);
		expect(warning).not.toHaveTextContent("daher ist er offline");
		cleanup();
		const popover = await openPopover(running);
		expect(popover).toHaveTextContent(
			"Nginx führt die vorherige Konfiguration dieses Hosts weiter aus, bis ein Neuladen gelingt.",
		);
		cleanup();
		const notRunning = {
			...running,
			nginxDetails: { ...running.nginxDetails, previousConfigRunning: false },
		} as HostMeta;
		render(<SaveWarning meta={notRunning} onClose={() => {}} />);
		expect(screen.getByTestId("save-warning")).toHaveTextContent("daher ist er offline");
		expect(screen.queryByTestId("host-previous-config")).toBeNull();
	});

	it("German: an error toast is one line, translated prefix then nginx's error", () => {
		changeLocale("de");
		const err = new ApiError(ENGLISH, { status: 400, details: advanced });
		expect(formatApiError(err)).toBe(
			`Fehler in der benutzerdefinierten Nginx-Konfiguration, Zeile 3: ${NGINX_TEXT}`,
		);
	});

	it("German: other scopes and special cases", () => {
		changeLocale("de");
		const text = (d: Partial<NginxConfigErrorDetails>) =>
			describeNginxError({ kind: "nginx_config", scope: "host", detail: null, ...d })?.text;
		expect(text({ scope: "global", hostType: "dead_host", hostId: 3 })).toBe(
			"Nginx hat die Konfiguration von 404 Host #3 abgelehnt",
		);
		expect(text({ scope: "global", file: "/data/nginx/custom/http.conf", line: 2 })).toBe(
			"Fehler in der nginx-Konfigurationsdatei /data/nginx/custom/http.conf, Zeile 2",
		);
		expect(text({ scope: "other_host", autoDisabled: true })).toBe(
			"Automatisch deaktiviert: Nginx hat die Konfiguration dieses Hosts abgelehnt",
		);
		expect(text({ reason: "conflict" })).toMatch(/^Diese Änderung steht im Konflikt/);
		expect(text({ reason: "redacted", scope: "global" })).toMatch(/Bitte einen Administrator/);
		expect(text({ reason: "too_many_broken_hosts", scope: "global", max: 10 })).toMatch(/mehr als 10/);
		const unsafe =
			"Ein gespeicherter Wert dieses Hosts kann nicht sicher in die nginx-Konfiguration geschrieben werden, daher wurde seine Konfiguration entfernt";
		// the value as it is, after the translated name of its field
		expect(
			describeNginxError({ kind: "unsafe_value", scope: "host", field: "location_path", detail: '"/a b"' }),
		).toEqual({ text: unsafe, detail: 'Pfad der benutzerdefinierten Location: "/a b"', hint: null });
		// the form's own label
		expect(
			describeNginxError({ kind: "unsafe_value", scope: "host", field: "forward_host", detail: '"a;b"' })?.detail,
		).toBe('Forward Hostname / IP: "a;b"');
		// stored without a field: the backend's message
		expect(
			describeNginxError({ kind: "unsafe_value", scope: "host", detail: 'proxy host #1: forward host "a b"' }),
		).toEqual({ text: unsafe, detail: 'proxy host #1: forward host "a b"', hint: null });
	});

	it("German: a host whose config nginx rejected at startup, with the hint how to bring it back", () => {
		changeLocale("de");
		expect(
			describeNginxError({
				kind: "nginx_config",
				scope: "host",
				reason: "rejected_at_startup",
				hintCode: "rejected_at_startup",
				detail: null,
			}),
		).toEqual({
			text: "Nginx hat die Konfiguration dieses Hosts beim Start des Containers abgelehnt",
			detail: null,
			hint: "Speichere den Host erneut, um ihn wieder zu aktivieren, oder lass NPM_RECONCILE_ON_START eingeschaltet, damit das automatisch geschieht.",
		});
	});

	it("a disabled host's badge uses the existing, translated 'disabled' text", () => {
		changeLocale("fr");
		render(<HostStatusFormatter enabled={false} meta={null} />);
		expect(screen.getByText("Désactivé")).toBeInTheDocument();
	});

	it("details stored by an older version keep the backend's message", async () => {
		changeLocale("de");
		const old: HostMeta = {
			nginxOnline: false,
			nginxErr: ENGLISH,
			nginxDetails: { kind: "nginx_config", scope: "host", line: 31 },
		};
		expect(describeNginxError(old.nginxDetails)).toBeNull();
		const popover = await openPopover(old);
		expect(popover).toHaveTextContent(ENGLISH);
	});
});
