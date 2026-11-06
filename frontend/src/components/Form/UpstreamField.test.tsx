import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { UpstreamCandidate, UpstreamCandidates } from "src/api/backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedPrefill, candidatePrefill, groupCandidates, UpstreamField } from "./UpstreamField";

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
}: {
	candidates?: UpstreamCandidates;
	onChange?: (v: string) => void;
	onSelectCandidate?: (...args: any[]) => void;
	initial?: string;
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
