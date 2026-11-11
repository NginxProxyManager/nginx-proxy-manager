import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Formik } from "formik";
import type { NginxLocationStatus, UpstreamCandidate, UpstreamCandidates, UpstreamCheckResult } from "src/api/backend";
import { changeLocale, intl } from "src/locale";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatValueList } from "src/modules/UpstreamText";
import { HostConfigTestResult } from "../HostConfigTest";
import { UpstreamCheckHint } from "../StatusBadges";
import { UpstreamField } from "./UpstreamField";

// Everything the forward host picker and the check / test results show is worded in the UI language: the
// backend sends codes and values only. Languages without a text for a new key fall back to English.

vi.mock("src/modals", () => ({ showHelpModal: vi.fn() }));
vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "de" }) }));
// candidates come through the hook (not the prop), so the menu has its refresh button
const hookState = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("src/hooks", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	useUpstreamCandidates: () => ({ data: hookState.data, isFetching: false, refresh: () => {}, isRefreshing: false }),
}));

const candidate = (c: Partial<UpstreamCandidate>): UpstreamCandidate => ({
	host: "x",
	kind: "history",
	owner: null,
	source: "history",
	ports: [],
	hintPort: null,
	hintScheme: null,
	network: null,
	state: null,
	ip: null,
	usedBy: 0,
	...c,
});

const candidates = (docker: UpstreamCandidates["providers"]["docker"]): UpstreamCandidates => ({
	providers: {
		docker,
		dns: { status: "ok", code: null, message: null },
		history: { status: "ok", code: null, message: null },
	},
	items: [
		candidate({
			host: "wiki-1",
			kind: "container",
			source: "docker",
			ports: [8080, 9090],
			state: "running",
			network: "npm_default",
			usedBy: 2,
		}),
		candidate({
			host: "wiki",
			kind: "compose_service",
			owner: "wiki-1",
			source: "docker",
			ports: [8080],
			state: "exited",
			network: "npm_default",
		}),
		candidate({ host: "db", kind: "dns", source: "dns", network: "backend" }),
		candidate({ host: "10.0.0.5", kind: "history", source: "history", ports: [3000], usedBy: 1 }),
	],
	generatedAt: "2026-11-11T10:00:00Z",
});

const timeout = { status: "unavailable" as const, code: "timeout", params: { seconds: 3 }, message: "English" };

const openPicker = (data: UpstreamCandidates) => {
	hookState.data = data;
	render(<UpstreamField id="host" value="" onChange={() => {}} />);
	const input = document.getElementById("host") as HTMLInputElement;
	fireEvent.focus(input);
	fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
	return document.querySelector(".react-select__menu") as HTMLElement;
};

const refused: UpstreamCheckResult = {
	host: "api",
	port: 8080,
	ok: false,
	code: "tcp_refused",
	ms: null,
	message: "Connection to api:8080 was refused.",
	addresses: ["10.0.0.2"],
};

// English texts of the backend and of the picker that must not show in another language
const ENGLISH = [
	"(container)",
	"compose service",
	"Compose service",
	"used by",
	"running",
	"exited",
	"Network:",
	"Docker containers",
	"Docker discovery",
	"did not answer",
	"English",
	"Refresh",
	"was refused",
	"nothing is listening",
];

const NO_RAW_IDS = /upstream\.|docker-error|host-test\.|\{[a-z]+\}/;

describe("forward host picker in German", () => {
	afterEach(() => {
		cleanup();
		changeLocale("en");
	});

	it("words options, state badges, ports, network, counts and the footer in German", () => {
		changeLocale("de");
		const menu = openPicker(candidates(timeout));
		const text = menu.textContent || "";
		expect(text).toContain("Docker-Container");
		expect(text).toContain("Im Netzwerk gefunden");
		expect(text).toContain("Bereits verwendet");
		expect(text).toContain("Compose-Dienst von wiki-1");
		expect(text).toMatch(/Ports: 8080.*9090/);
		expect(text).toContain("Netzwerk: npm_default");
		expect(text).toContain("Netzwerk: backend");
		expect(text).toContain("von 2 Hosts verwendet");
		expect(text).toContain("von 1 Host verwendet");
		// "running" is the common "Online", other states by name
		expect(menu.querySelector("[data-state=running]")).toHaveTextContent("Online");
		expect(menu.querySelector("[data-state=exited]")).toHaveTextContent("Beendet");
		expect(screen.getByTestId("docker-error-hint")).toHaveTextContent(
			"Docker-Erkennung funktioniert nicht. Die Docker-API hat nicht innerhalb von 3 Sekunden geantwortet.",
		);
		expect(menu.querySelector("button[aria-label]")).toHaveAttribute("aria-label", "Aktualisieren");
		for (const english of ENGLISH) {
			expect(text).not.toContain(english);
		}
		expect(text).not.toMatch(NO_RAW_IDS);
	});

	it("shows the raw error text of an unexpected failure as is, next to the German text", () => {
		changeLocale("de");
		openPicker(
			candidates({
				status: "unavailable",
				code: "failed",
				params: { detail: "connect EHOSTUNREACH 10.0.0.9:2375" },
				message: "Docker discovery failed: connect EHOSTUNREACH 10.0.0.9:2375",
			}),
		);
		const hint = screen.getByTestId("docker-error-hint");
		expect(hint).toHaveTextContent("Docker-Erkennung funktioniert nicht. Unerwarteter Fehler.");
		expect(screen.getByTestId("docker-error-detail")).toHaveTextContent("connect EHOSTUNREACH 10.0.0.9:2375");
		expect(hint).not.toHaveTextContent("Docker discovery failed");
	});

	it("words a reachability hint from its code, port and ms", () => {
		changeLocale("de");
		const { container, rerender } = render(<UpstreamCheckHint id="h" result={refused} />);
		expect(container.querySelector("#h")?.textContent).toBe(
			"Verbindung abgelehnt – Der Host existiert, aber auf Port 8080 lauscht nichts. – 10.0.0.2",
		);
		rerender(
			<UpstreamCheckHint
				id="h"
				result={{ ...refused, ok: true, code: "ok", ms: 1234.4, message: "api:8080 is reachable (1234 ms)." }}
			/>,
		);
		// German digits; the English backend sentence is not repeated
		expect(container.querySelector("#h")?.textContent).toBe("Erreichbar (1.234 ms) – 10.0.0.2");
		rerender(<UpstreamCheckHint id="h" result={{ ...refused, code: "invalid_host", host: "", port: 80 }} />);
		expect(container.querySelector("#h")).toHaveTextContent("Gib einen Hostnamen oder eine IP-Adresse ein.");
	});

	it("words the config test result in German", () => {
		changeLocale("de");
		const { getByTestId } = render(
			<Formik initialValues={{}} onSubmit={() => {}}>
				{() => (
					<HostConfigTestResult
						result={{
							ok: true,
							nginxOnline: true,
							nginxErr: null,
							nginxDetails: null,
							nginxLocations: [],
							upstreams: [{ ...refused, locationIndex: null, path: null }],
							warnings: [
								{ code: "upstreams_rate_limited", message: "English", retryAfter: 1 },
								{ code: "other_host_broken", message: "English", hostType: "proxy_host", hostId: 3 },
							],
						}}
						error={null}
						testedKey={null}
						onClose={() => {}}
					/>
				)}
			</Formik>,
		);
		const alert = getByTestId("host-test-result");
		// the main target: the common "Destination" column name
		expect(getByTestId("host-test-upstreams")).toHaveTextContent("Ziel");
		expect(alert).toHaveTextContent("Versuche es in 1 Sekunde erneut.");
		expect(alert).toHaveTextContent("Nginx lehnt die aktuelle Konfiguration von Proxy Host #3 ab.");
		expect(alert.textContent).not.toContain("English");
		expect(alert.textContent).not.toMatch(NO_RAW_IDS);
	});
});

describe("forward host picker in a partly translated language (French)", () => {
	afterEach(() => {
		cleanup();
		changeLocale("en");
	});

	it("shows the translated older keys it reuses, and English for the new ones", () => {
		changeLocale("fr");
		const menu = openPicker(candidates(timeout));
		// reused keys, translated in French
		expect(menu.querySelector("[data-state=running]")).toHaveTextContent("En ligne");
		expect(menu.querySelector("button[aria-label]")).toHaveAttribute("aria-label", "Actualiser");
		// keys only en/de/et/vi have: English, never a raw id
		const text = menu.textContent || "";
		expect(text).toContain("Compose service of wiki-1");
		expect(text).toContain("The Docker API did not answer within 3 seconds.");
		expect(text).not.toMatch(NO_RAW_IDS);
	});

	it("names other hosts with the French host type noun", () => {
		changeLocale("fr");
		const { getByTestId } = render(
			<Formik initialValues={{}} onSubmit={() => {}}>
				{() => (
					<HostConfigTestResult
						result={{
							ok: true,
							nginxOnline: true,
							nginxErr: null,
							nginxDetails: null,
							nginxLocations: [],
							upstreams: [],
							warnings: [{ code: "other_host_broken", message: "x", hostType: "proxy_host", hostId: 9 }],
						}}
						error={null}
						testedKey={null}
						onClose={() => {}}
					/>
				)}
			</Formik>,
		);
		expect(getByTestId("host-test-result")).toHaveTextContent(
			"Nginx rejects the current configuration of Hôte proxy #9.",
		);
	});
});

const testResult = (nginxLocations: NginxLocationStatus[]) => (
	<Formik initialValues={{}} onSubmit={() => {}}>
		{() => (
			<HostConfigTestResult
				result={{
					ok: true,
					nginxOnline: true,
					nginxErr: null,
					nginxDetails: null,
					nginxLocations,
					upstreams: [],
					warnings: [],
				}}
				error={null}
				testedKey={null}
				onClose={() => {}}
			/>
		)}
	</Formik>
);

const LOCATIONS: NginxLocationStatus[] = [
	{
		index: 0,
		path: "/ghost",
		status: "unresolved",
		mode: "dynamic",
		code: "unresolved",
		params: { host: "ghost-app" },
		message:
			'Host "ghost-app" can\'t be resolved right now. Requests to this location fail with 502 until it resolves.',
	},
	{
		index: 1,
		path: "/bad",
		status: "quarantined",
		mode: null,
		code: "rejected",
		params: { detail: 'Unknown directive "proxy_pas".' },
		message: 'Disabled because nginx rejected it: Unknown directive "proxy_pas".',
	},
	{
		index: 2,
		path: "~ ^/re",
		status: "quarantined",
		mode: null,
		code: "regex_forward_path",
		params: null,
		message:
			"A forward path without an nginx variable can't be used with a regular-expression location; use a capture such as /v1/$1, remove the forward path or use a prefix location.",
	},
];

describe("per-location states of a config test", () => {
	afterEach(() => {
		cleanup();
		changeLocale("en");
	});

	it("words them in the UI language, with nginx's text as an untranslated detail", () => {
		changeLocale("de");
		const { getByTestId } = render(testResult(LOCATIONS));
		const list = getByTestId("host-test-locations");
		expect(list).toHaveTextContent('Der Host "ghost-app" kann gerade nicht aufgelöst werden');
		expect(list).not.toHaveTextContent("can't be resolved");
		expect(list).toHaveTextContent("Nginx hat diese Location abgelehnt");
		expect(list).toHaveTextContent('Unknown directive "proxy_pas".');
		expect(list).not.toHaveTextContent("Disabled because");
		// a check of the backend: translated, no detail
		expect(list).toHaveTextContent("Location mit regulärem Ausdruck");
		expect(list).not.toHaveTextContent("regular-expression");
	});

	it("words them from their codes in English too, nginx's text below", () => {
		const { getByTestId } = render(testResult(LOCATIONS));
		const list = getByTestId("host-test-locations");
		expect(list).toHaveTextContent('Host "ghost-app" can\'t be resolved right now.');
		expect(list).toHaveTextContent("Nginx rejected this location, so it was disabled.");
		expect(list).toHaveTextContent('Unknown directive "proxy_pas".');
		expect(list).toHaveTextContent("can't be used with a regular-expression location");
	});

	it("shows the backend's message for a code this UI doesn't know", () => {
		changeLocale("de");
		const { getByTestId } = render(
			testResult([{ index: 0, path: "/n", status: "quarantined", mode: null, code: "new_check", message: "As sent" }]),
		);
		expect(getByTestId("host-test-locations")).toHaveTextContent("As sent");
	});
});

describe("lists and counts in languages with other list and plural rules", () => {
	afterEach(() => {
		cleanup();
		changeLocale("en");
	});

	it("separates ports, domains and addresses the same way between every item, never with 'and'", () => {
		const cases: Record<string, string> = {
			en: "8080, 9100, 9200",
			de: "8080, 9100, 9200",
			fr: "8080, 9100, 9200",
			ja: "8080、9100、9200",
			zh: "8080、9100、9200",
		};
		for (const [locale, expected] of Object.entries(cases)) {
			changeLocale(locale);
			expect(formatValueList([8080, 9100, 9200])).toBe(expected);
			expect(formatValueList(["8080", "9100"])).toBe(expected.split(/(?<=9100)/)[0]);
			expect(formatValueList(["a.example.com"])).toBe("a.example.com");
		}
	});

	it("uses the English singular for a count of 1 in a language without a 'one' plural (ja)", () => {
		changeLocale("ja");
		const menu = openPicker(
			candidates({ status: "unavailable", code: "timeout", params: { seconds: 1 }, message: "x" }),
		);
		const text = menu.textContent || "";
		expect(text).toContain("used by 1 host");
		expect(text).not.toContain("1 hosts");
		expect(text).toContain("used by 2 hosts");
		expect(text).toContain("within 1 second.");
		expect(text).toMatch(/Ports: 8080、9090/);
		expect(intl.formatMessage({ id: "host-test.quarantined" }, { count: 1 })).toBe(
			"Nginx would disable 1 custom location",
		);
	});
});
