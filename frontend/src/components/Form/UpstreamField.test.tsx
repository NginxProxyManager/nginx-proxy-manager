import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { UpstreamCandidate, UpstreamCandidates, UpstreamSuggestion } from "src/api/backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	allowedPrefill,
	candidatePrefill,
	DockerLabelsHelp,
	existingHostOf,
	groupCandidates,
	LabelPrefillHint,
	labelPrefill,
	UpstreamField,
} from "./UpstreamField";

const hookState = vi.hoisted(() => ({ data: undefined as unknown, refresh: () => {} }));
const helpModal = vi.hoisted(() => vi.fn());
vi.mock("src/modals", () => ({ showHelpModal: helpModal }));

vi.mock("src/hooks", () => ({
	useUpstreamCandidates: () => ({
		data: hookState.data,
		isFetching: false,
		refresh: hookState.refresh,
		isRefreshing: false,
	}),
}));

const candidate = (c: Partial<UpstreamCandidate>): UpstreamCandidate => ({
	host: "x",
	label: "x",
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

const items: UpstreamCandidate[] = [
	candidate({ host: "old-app", label: "old-app", source: "history", ports: [3000], usedBy: 2 }),
	candidate({
		host: "app",
		label: "app (container)",
		source: "docker",
		ports: [8080, 9090],
		hintPort: 9090,
		hintScheme: "https",
		state: "running",
		network: "npm_default",
	}),
	candidate({ host: "db-ui", label: "db-ui", source: "dns", ports: [8081] }),
];

const data = (
	dockerStatus: "ok" | "disabled" | "unavailable" = "ok",
	message: string | null = null,
): UpstreamCandidates => ({
	providers: {
		docker: { status: dockerStatus, message },
		dns: { status: "ok", message: null },
		history: { status: "ok", message: null },
	},
	items,
	generatedAt: "2026-11-04T10:00:00Z",
});

function Harness({
	candidates,
	onChange,
	onSelectCandidate,
	initial = "",
	labels,
}: {
	candidates?: UpstreamCandidates;
	onChange?: (v: string) => void;
	onSelectCandidate?: (...args: any[]) => void;
	initial?: string;
	labels?: { hostId?: number | null };
}) {
	const [value, setValue] = useState(initial);
	return (
		<>
			<UpstreamField
				id="host"
				value={value}
				candidates={candidates}
				onChange={(v) => {
					setValue(v);
					onChange?.(v);
				}}
				onSelectCandidate={onSelectCandidate}
				labels={labels}
			/>
			<input id="port" aria-label="Forward Port" />
			<output data-testid="value">{value}</output>
		</>
	);
}

const openMenu = () => {
	const input = document.getElementById("host") as HTMLInputElement;
	fireEvent.focus(input);
	fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
	return input;
};

describe("UpstreamField helpers", () => {
	it("groups candidates by source in a fixed order and drops empty groups", () => {
		const groups = groupCandidates(items);
		expect(groups.map((g) => g.label)).toEqual(["Docker containers", "Discovered on network", "Used before"]);
		expect(groups[0].options.map((o) => o.value)).toEqual(["app"]);
		expect(groupCandidates([items[0]]).map((g) => g.label)).toEqual(["Used before"]);
		expect(groupCandidates([])).toEqual([]);
	});

	it("prefills the hinted port and scheme, else a single port", () => {
		expect(candidatePrefill(items[1])).toEqual({ port: 9090, scheme: "https" });
		expect(candidatePrefill(items[0])).toEqual({ port: 3000 });
		expect(candidatePrefill(candidate({ ports: [80, 443] }))).toEqual({});
	});
});

describe("UpstreamField", () => {
	afterEach(() => cleanup());

	it("shows grouped options with ports and state", () => {
		render(<Harness candidates={data()} />);
		openMenu();
		expect(screen.getByText("Docker containers")).toBeInTheDocument();
		expect(screen.getByText("Discovered on network")).toBeInTheDocument();
		expect(screen.getByText("Used before")).toBeInTheDocument();
		expect(screen.getByText("running")).toBeInTheDocument();
		expect(screen.getByText(/Ports: 8080, 9090/)).toBeInTheDocument();
	});

	it("selecting a candidate sets the host and reports the prefill", () => {
		const onSelect = vi.fn();
		render(<Harness candidates={data()} onSelectCandidate={onSelect} />);
		openMenu();
		fireEvent.click(screen.getByText("app"));
		expect(screen.getByTestId("value")).toHaveTextContent("app");
		expect(onSelect).toHaveBeenCalledWith(
			{ port: 9090, scheme: "https" },
			expect.objectContaining({ host: "app" }),
		);
	});

	it("keeps the picked host visible after selecting and after leaving the field", () => {
		render(<Harness candidates={data()} />);
		const input = openMenu();
		fireEvent.click(screen.getByText("app"));
		expect(input.value).toBe("app");
		expect(input.style.opacity).not.toBe("0");
		fireEvent.blur(input);
		expect(input.value).toBe("app");
		expect(input.style.opacity).not.toBe("0");
	});

	it("keeps a created value visible after pressing Enter", () => {
		render(<Harness candidates={data()} />);
		const input = openMenu();
		fireEvent.change(input, { target: { value: "my-service" } });
		fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
		expect(screen.getByTestId("value")).toHaveTextContent("my-service");
		expect(input.value).toBe("my-service");
		expect(input.style.opacity).not.toBe("0");
		fireEvent.blur(input);
		expect(input.value).toBe("my-service");
		expect(input.style.opacity).not.toBe("0");
	});

	it("keeps free text verbatim, including host/path and IPs", () => {
		const onChange = vi.fn();
		const onSelect = vi.fn();
		render(<Harness candidates={data()} onChange={onChange} onSelectCandidate={onSelect} />);
		const input = openMenu();
		fireEvent.change(input, { target: { value: "10.0.0.1/sub/path" } });
		expect(onChange).toHaveBeenLastCalledWith("10.0.0.1/sub/path");
		expect(screen.getByTestId("value")).toHaveTextContent("10.0.0.1/sub/path");
		// still there after leaving the field
		fireEvent.blur(input);
		expect(input.value).toBe("10.0.0.1/sub/path");
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("explains how to enable Docker discovery when it's disabled", () => {
		render(<Harness candidates={data("disabled")} />);
		openMenu();
		expect(screen.getByTestId("docker-disabled-hint")).toHaveTextContent("Docker discovery is off");
	});

	it("opens the setup help from the hint without taking the focus first", () => {
		render(<Harness candidates={data("disabled")} />);
		openMenu();
		const link = screen.getByTestId("docker-help-link");
		// mousedown must not take the focus from the input (react-select would close the menu)
		expect(fireEvent.mouseDown(link)).toBe(false);
		fireEvent.click(link);
		expect(helpModal).toHaveBeenCalledWith("DockerDiscovery", "lime");
	});

	it("shows why Docker discovery doesn't work and links the help", () => {
		render(<Harness candidates={data("unavailable", "permission denied on the Docker socket")} />);
		openMenu();
		expect(screen.getByTestId("docker-error-hint")).toHaveTextContent("permission denied on the Docker socket");
		expect(screen.getByTestId("docker-help-link")).toBeInTheDocument();
		expect(screen.queryByTestId("docker-disabled-hint")).toBeNull();
	});

	it("doesn't show the Docker hint when discovery works", () => {
		render(<Harness candidates={data("ok")} />);
		openMenu();
		expect(screen.queryByTestId("docker-disabled-hint")).toBeNull();
	});

	it("has a help icon for the label reference that is a normal Tab stop", () => {
		render(<DockerLabelsHelp />);
		const button = screen.getByRole("button", { name: "Docker labels" });
		expect(button.tabIndex).toBe(0);
		fireEvent.click(button);
		expect(helpModal).toHaveBeenLastCalledWith("DockerDiscovery", "lime");
	});

	it("links the label reference whatever the Docker discovery status", () => {
		render(<Harness candidates={data("ok")} />);
		openMenu();
		const link = screen.getByTestId("docker-labels-link");
		expect(link).toHaveTextContent("Docker labels");
		expect(fireEvent.mouseDown(link)).toBe(false);
		fireEvent.click(link);
		expect(helpModal).toHaveBeenLastCalledWith("DockerDiscovery", "lime");
		cleanup();
		// disabled / unavailable: the setup link opens the same page
		for (const status of ["disabled", "unavailable"] as const) {
			render(<Harness candidates={data(status, "connection refused")} />);
			openMenu();
			fireEvent.click(screen.getByTestId("docker-help-link"));
			expect(helpModal).toHaveBeenLastCalledWith("DockerDiscovery", "lime");
			cleanup();
		}
		// without any suggestions (e.g. no permission) as well
		render(<Harness />);
		openMenu();
		expect(screen.getByTestId("docker-labels-link")).toBeInTheDocument();
	});
});

// Candidates whose host starts with what a user would type for something else
const prefixData: UpstreamCandidates = {
	providers: data().providers,
	items: [
		candidate({ host: "10.0.0.15", label: "10.0.0.15", source: "history", ports: [3000] }),
		candidate({ host: "app-db", label: "app-db", source: "docker", ports: [5432] }),
		candidate({ host: "web", label: "web", source: "docker", ports: [80] }),
	],
	generatedAt: "2026-11-04T10:00:00Z",
};

const hostInput = () => document.getElementById("host") as HTMLInputElement;
const typeInto = (text: string) => {
	const input = hostInput();
	fireEvent.focus(input);
	fireEvent.change(input, { target: { value: text } });
	return input;
};
const clickControl = () => {
	fireEvent.mouseDown(document.querySelector(".react-select__control") as HTMLElement, { button: 0 });
	fireEvent.focus(hostInput());
};
const focusedOption = () => document.querySelector(".react-select__option--is-focused");
const optionTexts = () =>
	Array.from(document.querySelectorAll(".react-select__option strong")).map((e) => e.textContent);

describe("UpstreamField keyboard", () => {
	afterEach(() => cleanup());

	for (const [typed, key] of [
		["10.0.0.1", "Tab"],
		["10.0.0.1", "Enter"],
		["app", "Tab"],
		["app", "Enter"],
	]) {
		it(`typing "${typed}" and pressing ${key} keeps the typed text`, () => {
			const onSelect = vi.fn();
			render(<Harness candidates={prefixData} onSelectCandidate={onSelect} />);
			const input = typeInto(typed);
			expect(document.querySelector(".react-select__menu")).not.toBeNull();
			fireEvent.keyDown(input, { key, code: key });
			expect(screen.getByTestId("value")).toHaveTextContent(new RegExp(`^${typed.replace(/\./g, "\\.")}$`));
			expect(input.value).toBe(typed);
			expect(onSelect).not.toHaveBeenCalled();
		});
	}

	it("no option is highlighted while typing, and Enter just closes the menu", () => {
		render(<Harness candidates={prefixData} />);
		const input = typeInto("app");
		expect(document.querySelector(".react-select__menu")).not.toBeNull();
		expect(focusedOption()).toBeNull();
		fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
		expect(document.querySelector(".react-select__menu")).toBeNull();
		expect(screen.getByTestId("value")).toHaveTextContent(/^app$/);
	});

	it("clicking into a filled field and pressing Tab keeps the value", () => {
		const onSelect = vi.fn();
		render(<Harness candidates={prefixData} initial="app" onSelectCandidate={onSelect} />);
		clickControl();
		expect(document.querySelector(".react-select__menu")).not.toBeNull();
		expect(focusedOption()).toBeNull();
		fireEvent.keyDown(hostInput(), { key: "Tab", code: "Tab" });
		expect(screen.getByTestId("value")).toHaveTextContent(/^app$/);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("pressing Enter in a filled field keeps the value", () => {
		const onSelect = vi.fn();
		render(<Harness candidates={prefixData} initial="app" onSelectCandidate={onSelect} />);
		clickControl();
		fireEvent.keyDown(hostInput(), { key: "Enter", code: "Enter" });
		expect(screen.getByTestId("value")).toHaveTextContent(/^app$/);
		expect(hostInput().value).toBe("app");
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("arrow keys highlight an option and Enter picks it", () => {
		const onSelect = vi.fn();
		render(<Harness candidates={prefixData} onSelectCandidate={onSelect} />);
		const input = typeInto("app");
		fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
		// the first press highlights the first match instead of skipping it
		expect(focusedOption()).toHaveTextContent("app-db");
		fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
		expect(screen.getByTestId("value")).toHaveTextContent(/^app-db$/);
		expect(onSelect).toHaveBeenCalledWith({ port: 5432 }, expect.objectContaining({ host: "app-db" }));
	});

	it("ArrowDown on a closed menu opens it with the first option highlighted", () => {
		render(<Harness candidates={prefixData} />);
		const input = hostInput();
		fireEvent.focus(input);
		fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
		expect(focusedOption()).toHaveTextContent("app-db");
		fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
		expect(focusedOption()).toHaveTextContent("web");
	});

	it("typing after using the arrows drops the highlight again", () => {
		const onSelect = vi.fn();
		render(<Harness candidates={prefixData} onSelectCandidate={onSelect} />);
		const input = typeInto("a");
		fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
		expect(focusedOption()).not.toBeNull();
		fireEvent.change(input, { target: { value: "ap" } });
		expect(focusedOption()).toBeNull();
		fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
		fireEvent.keyDown(input, { key: "Tab", code: "Tab" });
		expect(screen.getByTestId("value")).toHaveTextContent(/^ap$/);
		expect(onSelect).not.toHaveBeenCalled();
	});

	const homeData: UpstreamCandidates = {
		...prefixData,
		items: [
			candidate({ host: "myhost-db", label: "myhost-db", source: "docker", ports: [5432] }),
			candidate({ host: "myhost-web", label: "myhost-web", source: "docker", ports: [80] }),
		],
	};

	for (const key of ["Home", "End"]) {
		it(`${key} with the menu open moves the caret and doesn't highlight an option`, () => {
			const onSelect = vi.fn();
			render(<Harness candidates={homeData} onSelectCandidate={onSelect} />);
			const input = typeInto("myhost");
			input.setSelectionRange(3, 3);
			expect(document.querySelector(".react-select__menu")).not.toBeNull();
			fireEvent.keyDown(input, { key, code: key });
			expect(focusedOption()).toBeNull();
			const at = key === "Home" ? 0 : 6;
			expect([input.selectionStart, input.selectionEnd]).toEqual([at, at]);
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
			expect(screen.getByTestId("value")).toHaveTextContent(/^myhost$/);
			expect(input.value).toBe("myhost");
			expect(onSelect).not.toHaveBeenCalled();
		});
	}

	it("Shift+Home / Shift+End select from the caret", () => {
		render(<Harness candidates={homeData} />);
		const input = typeInto("myhost");
		input.setSelectionRange(2, 2);
		fireEvent.keyDown(input, { key: "Home", code: "Home", shiftKey: true });
		expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([0, 2, "backward"]);
		fireEvent.keyDown(input, { key: "End", code: "End", shiftKey: true });
		expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([2, 6, "forward"]);
		expect(focusedOption()).toBeNull();
	});

	it("Home after navigating keeps the highlighted option", () => {
		const onSelect = vi.fn();
		render(<Harness candidates={homeData} onSelectCandidate={onSelect} />);
		const input = typeInto("myhost");
		fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
		fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
		const highlighted = focusedOption()?.textContent;
		fireEvent.keyDown(input, { key: "Home", code: "Home" });
		expect(focusedOption()?.textContent).toBe(highlighted);
	});

	it("a click on an option still picks it", () => {
		const onSelect = vi.fn();
		render(<Harness candidates={prefixData} onSelectCandidate={onSelect} />);
		typeInto("app");
		fireEvent.click(screen.getByText("app-db"));
		expect(screen.getByTestId("value")).toHaveTextContent(/^app-db$/);
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it("a filled field offers all candidates until the user types", () => {
		render(<Harness candidates={prefixData} initial="app-db" />);
		clickControl();
		expect(optionTexts()).toEqual(["app-db", "web", "10.0.0.15"]);
		fireEvent.change(hostInput(), { target: { value: "app-d" } });
		expect(optionTexts()).toEqual(["app-db"]);
	});
});

describe("allowedPrefill", () => {
	it("fills empty fields", () => {
		expect(allowedPrefill({ port: 3000, scheme: "https" }, { port: "", scheme: undefined }, {})).toEqual({
			port: 3000,
			scheme: "https",
		});
	});

	it("replaces fields that still hold their initial value", () => {
		expect(
			allowedPrefill({ port: 3000, scheme: "https" }, { port: 80, scheme: "http" }, { port: 80, scheme: "http" }),
		).toEqual({ port: 3000, scheme: "https" });
		// form values may be strings while the initial ones are numbers
		expect(allowedPrefill({ port: 3000 }, { port: "80" }, { port: 80 })).toEqual({ port: 3000 });
	});

	it("keeps a port or scheme the user changed", () => {
		expect(
			allowedPrefill(
				{ port: 3000, scheme: "https" },
				{ port: 8443, scheme: "http" },
				{ port: 80, scheme: "http" },
			),
		).toEqual({ scheme: "https" });
		expect(
			allowedPrefill({ port: 3000, scheme: "http" }, { port: 80, scheme: "https" }, { port: 80, scheme: "http" }),
		).toEqual({
			port: 3000,
		});
	});

	it("replaces what an earlier pick filled in", () => {
		expect(allowedPrefill({ port: 4000 }, { port: 3000 }, { port: 80 }, { port: 3000 })).toEqual({ port: 4000 });
		expect(allowedPrefill({ port: 4000 }, { port: 3001 }, { port: 80 }, { port: 3000 })).toEqual({});
	});

	it("returns nothing for an empty prefill", () => {
		expect(allowedPrefill({}, { port: "" }, {})).toEqual({});
	});
});

// What a browser does on Tab when the keydown isn't prevented: focus the next
// element in tab order (as it is after React has handled the keydown).
const pressTab = (from: HTMLElement) => {
	const notPrevented = fireEvent.keyDown(from, { key: "Tab", code: "Tab" });
	if (!notPrevented) return;
	const tabbable = Array.from(
		document.querySelectorAll<HTMLElement>("input, button, select, textarea, a[href], [tabindex]"),
	).filter((el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled);
	const next = tabbable[tabbable.indexOf(from) + 1];
	from.blur();
	fireEvent.blur(from);
	if (next) {
		next.focus();
		fireEvent.focus(next);
	}
};

describe("UpstreamField selection guard", () => {
	afterEach(() => {
		cleanup();
		hookState.data = undefined;
	});

	it("Space in an empty field with the menu open doesn't pick the focused option", () => {
		const onSelect = vi.fn();
		render(<Harness candidates={prefixData} onSelectCandidate={onSelect} />);
		clickControl();
		expect(document.querySelector(".react-select__menu")).not.toBeNull();
		fireEvent.keyDown(hostInput(), { key: " ", code: "Space" });
		expect(screen.getByTestId("value")).toHaveTextContent(/^$/);
		expect(hostInput().value).toBe("");
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("Space doesn't pick an option even after navigating with the arrows", () => {
		const onSelect = vi.fn();
		render(<Harness candidates={prefixData} onSelectCandidate={onSelect} />);
		const input = openMenu();
		expect(focusedOption()).toHaveTextContent("app-db");
		fireEvent.keyDown(input, { key: " ", code: "Space" });
		expect(screen.getByTestId("value")).toHaveTextContent(/^$/);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("Space with a saved value and the menu open keeps the value", () => {
		const onSelect = vi.fn();
		render(<Harness candidates={prefixData} initial="web" onSelectCandidate={onSelect} />);
		clickControl();
		// clear the text, menu stays open, then Space
		fireEvent.change(hostInput(), { target: { value: "" } });
		fireEvent.keyDown(hostInput(), { key: " ", code: "Space" });
		expect(screen.getByTestId("value")).toHaveTextContent(/^$/);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("Tab with the menu open closes it and moves on to the next field, keeping the value", () => {
		hookState.data = prefixData;
		render(<Harness initial="my-host" />);
		clickControl();
		expect(document.querySelector(".react-select__menu")).not.toBeNull();
		// the refresh button in the menu footer is shown but isn't a Tab stop
		const refresh = screen.getByLabelText("Refresh suggestions");
		expect(refresh.tabIndex).toBe(-1);
		pressTab(hostInput());
		expect(document.querySelector(".react-select__menu")).toBeNull();
		expect(document.activeElement).toBe(document.getElementById("port"));
		expect(screen.getByTestId("value")).toHaveTextContent(/^my-host$/);
		expect(hostInput().value).toBe("my-host");
	});

	it("Tab after typing with the menu open moves on and keeps the typed text", () => {
		hookState.data = prefixData;
		const onSelect = vi.fn();
		render(<Harness onSelectCandidate={onSelect} />);
		const input = typeInto("app");
		expect(document.querySelector(".react-select__menu")).not.toBeNull();
		pressTab(input);
		expect(document.activeElement).toBe(document.getElementById("port"));
		expect(screen.getByTestId("value")).toHaveTextContent(/^app$/);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("a click on the 'use value' option still creates it", () => {
		render(<Harness candidates={prefixData} />);
		typeInto("new-host ");
		fireEvent.click(screen.getByText(/new-host/, { selector: ".react-select__option" }));
		expect(screen.getByTestId("value")).toHaveTextContent(/^new-host$/);
	});
});

const suggestion = (s: Partial<UpstreamSuggestion> = {}): UpstreamSuggestion => ({
	domainNames: [],
	forwardScheme: "http",
	forwardHost: "x",
	forwardPort: null,
	allowWebsocketUpgrade: false,
	blockExploits: false,
	cachingEnabled: false,
	http2Support: false,
	ignoredDomains: [],
	existingHostId: null,
	existingHostType: null,
	...s,
});

const blog = suggestion({
	domainNames: ["blog.example.com", "www.blog.example.com"],
	forwardHost: "blog",
	forwardPort: 2368,
	allowWebsocketUpgrade: true,
	blockExploits: true,
	http2Support: true,
});
const untouched = new Set<string>();

describe("labelPrefill", () => {
	it("fills the domains and all switches of a new host", () => {
		expect(labelPrefill(blog, { isNew: true, domainNames: [], touched: untouched })).toEqual({
			domainNames: ["blog.example.com", "www.blog.example.com"],
			toggles: { allowWebsocketUpgrade: true, blockExploits: true, cachingEnabled: false },
			http2Support: true,
			existingHost: null,
			labelDomains: ["blog.example.com", "www.blog.example.com"],
			ignoredDomains: [],
		});
	});

	it("never changes the domains or switches of a host being edited", () => {
		const result = labelPrefill(blog, { isNew: false, domainNames: [], touched: untouched });
		expect(result.domainNames).toBeUndefined();
		expect(result.toggles).toEqual({});
		expect(result.http2Support).toBeUndefined();
		expect(result.existingHost).toBeNull();
	});

	it("keeps domains the user entered", () => {
		const result = labelPrefill(blog, { isNew: true, domainNames: ["mine.example.com"], touched: untouched });
		expect(result.domainNames).toBeUndefined();
		// the switches are still free
		expect(result.toggles.allowWebsocketUpgrade).toBe(true);
	});

	it("replaces domains an earlier pick filled in, but not once the user changed them", () => {
		const earlier = ["shop.example.com"];
		expect(
			labelPrefill(blog, { isNew: true, domainNames: ["shop.example.com"], touched: untouched }, earlier)
				.domainNames,
		).toEqual(blog.domainNames);
		expect(
			labelPrefill(
				blog,
				{ isNew: true, domainNames: ["shop.example.com", "more.example.com"], touched: untouched },
				earlier,
			).domainNames,
		).toBeUndefined();
	});

	it("leaves the switches the user changed alone", () => {
		const touched = new Set(["allowWebsocketUpgrade", "cachingEnabled"]);
		expect(labelPrefill(blog, { isNew: true, domainNames: [], touched }).toggles).toEqual({ blockExploits: true });
	});

	it("turns untouched switches off again for a container without those labels", () => {
		const plain = suggestion({ forwardHost: "plain" });
		const result = labelPrefill(plain, { isNew: true, domainNames: [], touched: untouched });
		expect(result.toggles).toEqual({ allowWebsocketUpgrade: false, blockExploits: false, cachingEnabled: false });
		expect(result.domainNames).toBeUndefined();
		expect(result.http2Support).toBe(false);
	});

	it("doesn't fill domains another host already has, and says which host", () => {
		for (const type of ["proxy_host", "redirection_host", "dead_host"] as const) {
			const taken = { ...blog, existingHostId: 7, existingHostType: type };
			const result = labelPrefill(taken, { isNew: true, domainNames: [], touched: untouched });
			expect(result.domainNames).toBeUndefined();
			expect(result.existingHost).toEqual({ id: 7, type });
			expect(result.labelDomains).toEqual(blog.domainNames);
		}
	});

	it("reports the npm.domain entries that were dropped", () => {
		const s = { ...blog, ignoredDomains: ["*.com"] };
		expect(labelPrefill(s, { isNew: true, domainNames: [], touched: untouched }).ignoredDomains).toEqual(["*.com"]);
	});

	it("does nothing for a candidate without labels (DNS, history)", () => {
		expect(labelPrefill(undefined, { isNew: true, domainNames: [], touched: untouched })).toEqual({
			toggles: {},
			existingHost: null,
			labelDomains: [],
			ignoredDomains: [],
		});
	});

	it("doesn't count the host being edited as the one that has the domains", () => {
		const own = { ...blog, existingHostId: 3, existingHostType: "proxy_host" as const };
		expect(existingHostOf(own, 3)).toBeNull();
		expect(existingHostOf(own, 4)).toEqual({ id: 3, type: "proxy_host" });
		// a redirection host with the same id is another host
		expect(existingHostOf({ ...own, existingHostType: "redirection_host" }, 3)).toEqual({
			id: 3,
			type: "redirection_host",
		});
	});
});

const labelled: UpstreamCandidates = {
	providers: data().providers,
	items: [
		candidate({
			host: "blog",
			label: "blog (container)",
			source: "docker",
			ports: [2368],
			state: "running",
			suggestion: blog,
		}),
		candidate({
			host: "shop",
			label: "shop (container)",
			source: "docker",
			ports: [80],
			state: "running",
			suggestion: suggestion({
				domainNames: ["shop.example.com"],
				forwardHost: "shop",
				ignoredDomains: ["*.com"],
				existingHostId: 7,
				existingHostType: "redirection_host",
			}),
		}),
	],
	generatedAt: "2026-11-04T10:00:00Z",
};

const option = (host: string) =>
	Array.from(document.querySelectorAll(".react-select__option")).find(
		(o) => o.querySelector("strong")?.textContent === host,
	) as HTMLElement;

describe("UpstreamField label domains", () => {
	afterEach(() => cleanup());

	it("shows the label domains and marks containers whose domains have a host", () => {
		render(<Harness candidates={labelled} labels={{ hostId: null }} />);
		openMenu();
		expect(option("blog").querySelector("[data-testid=option-domains]")).toHaveTextContent(
			"blog.example.com, www.blog.example.com",
		);
		expect(option("blog").querySelector("[data-testid=existing-host-badge]")).toBeNull();
		const badge = option("shop").querySelector("[data-testid=existing-host-badge]") as HTMLElement;
		expect(badge).toHaveTextContent("domain in use");
		expect(badge).toHaveAttribute("data-type", "redirection_host");
		expect(badge.getAttribute("title")).toMatch(/redirection host already uses/);
		expect(option("shop").querySelector("[data-testid=option-ignored-domains]")).toHaveTextContent("*.com");
	});

	it("doesn't mark the container of the proxy host being edited", () => {
		const own: UpstreamCandidates = {
			...labelled,
			items: [
				{ ...labelled.items[0], suggestion: { ...blog, existingHostId: 3, existingHostType: "proxy_host" } },
			],
		};
		render(<Harness candidates={own} labels={{ hostId: 3 }} />);
		openMenu();
		expect(screen.queryByTestId("existing-host-badge")).toBeNull();
	});

	it("leaves the label details out where there are no domains (streams, locations)", () => {
		render(<Harness candidates={labelled} />);
		openMenu();
		expect(screen.queryByTestId("option-domains")).toBeNull();
		expect(screen.queryByTestId("existing-host-badge")).toBeNull();
		expect(screen.queryByTestId("option-ignored-domains")).toBeNull();
	});
});

describe("LabelPrefillHint", () => {
	afterEach(() => cleanup());
	const base = { toggles: {}, labelDomains: ["shop.example.com"], ignoredDomains: [] as string[] };

	it("offers to open the proxy host that has the domains", () => {
		const onOpen = vi.fn();
		render(<LabelPrefillHint prefill={{ ...base, existingHost: { id: 7, type: "proxy_host" } }} onOpen={onOpen} />);
		const hint = screen.getByTestId("label-existing-host");
		expect(hint).toHaveTextContent("A proxy host already uses one of these domains");
		expect(hint).toHaveTextContent("(shop.example.com) were not filled in");
		expect(hint).not.toHaveTextContent("change or remove it first");
		fireEvent.click(screen.getByTestId("open-existing"));
		expect(onOpen).toHaveBeenCalledWith({ id: 7, type: "proxy_host" });
	});

	it("says a redirection or 404 host has to be changed first", () => {
		render(
			<LabelPrefillHint prefill={{ ...base, existingHost: { id: 2, type: "dead_host" } }} onOpen={() => {}} />,
		);
		const hint = screen.getByTestId("label-existing-host");
		expect(hint).toHaveTextContent("Used by a 404 host: change or remove it first");
		// said once, not twice
		expect(hint).not.toHaveTextContent("already uses one of these domains");
		expect(screen.getByTestId("open-existing")).toBeInTheDocument();
	});

	it("lists dropped npm.domain entries, and shows nothing when there is nothing to say", () => {
		const { rerender } = render(
			<LabelPrefillHint
				prefill={{ ...base, existingHost: null, ignoredDomains: ["*.com", "bad!.example.com"] }}
				onOpen={() => {}}
			/>,
		);
		expect(screen.getByTestId("ignored-domains")).toHaveTextContent("*.com, bad!.example.com");
		expect(screen.queryByTestId("label-existing-host")).toBeNull();
		rerender(<LabelPrefillHint prefill={{ ...base, existingHost: null }} onOpen={() => {}} />);
		expect(screen.queryByTestId("label-hint")).toBeNull();
	});
});
