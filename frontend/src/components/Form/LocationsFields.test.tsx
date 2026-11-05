import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik } from "formik";
import type { NginxLocationStatus, ProxyLocation, UpstreamCheckResult } from "src/api/backend";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	cleanLocations,
	isBlankLocation,
	LocationsFields,
	statusForRow,
	validateLocations,
} from "./LocationsFields";

const { checkState } = vi.hoisted(() => ({
	checkState: { result: null as UpstreamCheckResult | null, calls: [] as any[], candidates: undefined as any },
}));

vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en" }) }));
vi.mock("src/hooks", () => ({
	useAccessLists: () => ({ isLoading: false, isError: false, data: [] }),
	useUpstreamCandidates: () => ({
		data: checkState.candidates,
		isFetching: false,
		refresh: vi.fn(),
		isRefreshing: false,
	}),
	useUpstreamCheck: (input: any, enabled: boolean) => {
		checkState.calls.push({ input, enabled });
		return { result: enabled ? checkState.result : null, isChecking: false };
	},
}));

const loc = (l: Partial<ProxyLocation>): ProxyLocation => ({
	path: "/a",
	advancedConfig: "",
	forwardScheme: "http",
	forwardHost: "app",
	forwardPort: 80,
	accessListId: 0,
	...l,
});

const renderFields = (
	initial: ProxyLocation[],
	props: { statuses?: NginxLocationStatus[]; highlightIndex?: number | null; allowAdvanced?: boolean } = {},
) => {
	const onSubmit = vi.fn();
	const utils = render(
		<Formik initialValues={{ locations: initial }} onSubmit={onSubmit}>
			{({ values }) => (
				<Form>
					<LocationsFields initialValues={initial} {...props} />
					<output data-testid="values">{JSON.stringify(values.locations)}</output>
					<button type="submit">save</button>
				</Form>
			)}
		</Formik>,
	);
	const formValues = () => JSON.parse(screen.getByTestId("values").textContent || "[]") as ProxyLocation[];
	return { ...utils, onSubmit, formValues };
};

describe("validateLocations", () => {
	it("accepts valid locations and ignores blank rows", () => {
		expect(validateLocations([loc({}), loc({ path: "", forwardHost: "" })])).toEqual([undefined, undefined]);
	});

	it("requires path, host and a valid port for rows with content", () => {
		const [e] = validateLocations([loc({ path: "", forwardHost: "app", forwardPort: "" as any })]);
		expect(e?.path).toBe("This is required");
		expect(e?.forwardPort).toBe("This is required");
		const [e2] = validateLocations([loc({ forwardHost: "", forwardPort: 70000 })]);
		expect(e2?.forwardHost).toBe("This is required");
		expect(e2?.forwardPort).toMatch(/65535/);
		const [e3] = validateLocations([loc({ forwardPort: 0 })]);
		expect(e3?.forwardPort).toMatch(/1/);
	});

	it("flags whitespace and nginx syntax characters in the host", () => {
		expect(validateLocations([loc({ forwardHost: "my app" })])[0]?.forwardHost).toMatch(/spaces/);
		expect(validateLocations([loc({ forwardHost: "app;evil" })])[0]?.forwardHost).toMatch(/not allowed/);
		// surrounding whitespace is trimmed by the server, host/path is allowed
		expect(validateLocations([loc({ forwardHost: " app/sub/ " })])[0]).toBeUndefined();
	});

	it("checks the format of a disabled row too, the API refuses it", () => {
		const hosts = ["app;evil", "my app", "app/a b", "app$x", "$backend"];
		for (const enabled of [false, true, undefined]) {
			const errors = validateLocations(hosts.map((forwardHost, i) => loc({ path: `/d${i}`, enabled, forwardHost })));
			expect(errors.every((e) => e?.forwardHost)).toBe(true);
		}
	});

	it("keeps the checks the API makes for every row on a disabled row", () => {
		const [host, low, high, path] = validateLocations([
			loc({ path: "/a", enabled: false, forwardHost: "" }),
			loc({ path: "/b", enabled: false, forwardPort: 0 }),
			loc({ path: "/c", enabled: false, forwardPort: 70000 }),
			loc({ path: "", enabled: false }),
		]);
		expect(host?.forwardHost).toBe("This is required");
		expect(low?.forwardPort).toMatch(/1/);
		expect(high?.forwardPort).toMatch(/65535/);
		expect(path?.path).toBe("This is required");
		// the backend rejects duplicate paths among disabled rows too
		const [, dup] = validateLocations([loc({ path: "/x" }), loc({ path: "/x", enabled: false })]);
		expect(dup?.path).toMatch(/already uses/);
		expect(dup?.forwardHost).toBeUndefined();
	});

	it("requires a host part, not just a path", () => {
		// the server would store an empty forward host and quarantine the location
		for (const forwardHost of ["/api", " /x", "/", "  "]) {
			expect(validateLocations([loc({ forwardHost })])[0]?.forwardHost).toMatch(/required/);
		}
	});

	it("rejects nginx syntax characters and whitespace in the path part", () => {
		for (const forwardHost of [
			"app/x;y",
			"app/a}",
			"app/{a",
			"app/#x",
			'app/"q',
			"app/'q",
			"app/`q",
			"app/a\\b",
			"app/my path",
			"app/$" + "{a b}",
			"app/$" + "{}",
			// braced variables: the API refuses the braces
			"app/$" + "{uri}",
			"app/a\tb",
			"app/a\u0007b",
		]) {
			expect(validateLocations([loc({ forwardHost })])[0]?.forwardHost).toMatch(
				/invalid characters in forward path/i,
			);
		}
		// nginx variables in the path are fine
		for (const forwardHost of [
			"app/$uri",
			"app/api/$arg_x",
			"app/a-b_c.d/~e",
		]) {
			expect(validateLocations([loc({ forwardHost })])[0]).toBeUndefined();
		}
	});

	it("rejects nginx variables and control characters in the host, like the API", () => {
		// the API refuses "$" in the host part since v2.17; variable hosts saved before still render
		for (const host of ["$backend", " $up_2 ", "$backend/api", "$backend:80", "app$x", "app$x/api", "$" + "{backend}", "a#b", "a\\b", "a\u0001b"]) {
			expect(validateLocations([loc({ forwardHost: host })])[0]?.forwardHost).toMatch(/not allowed/);
		}
		expect(validateLocations([loc({ forwardHost: "$back;end/api" })])[0]?.forwardHost).toMatch(/not allowed/);
		expect(validateLocations([loc({ forwardHost: "$back end" })])[0]?.forwardHost).toBeTruthy();
	});

	it("checks the location path like the API", () => {
		for (const path of ["/a", " /a/ ", "= /exact", "^~ /pre/", "~ ^/re/(.*)$", "~* \\.php$", '"/q p/"', "@named", "/a\\.b"]) {
			expect(validateLocations([loc({ path })])[0]).toBeUndefined();
		}
		for (const path of ["/a b", "/a;b", "/a{", "/a}", "/a#b", "/a'b", '/a"b', "~", "^~", "/a\\", "/a\\ b", '"/a', "/a\u0001"]) {
			expect(validateLocations([loc({ path })])[0]?.path).toMatch(/not allowed/);
		}
	});

	it("treats a prefix path and the same path with ^~ as duplicates", () => {
		const errors = validateLocations([loc({ path: "/x" }), loc({ path: "^~ /x" }), loc({ path: "^~/y" })]);
		expect(errors[0]?.path).toMatch(/already uses \^~ \/x/);
		expect(errors[1]?.path).toMatch(/already uses \/x/);
		expect(errors[2]).toBeUndefined();
		// nginx strips the quotes of a quoted path
		expect(validateLocations([loc({ path: '"/q"' }), loc({ path: "/q" })])[1]?.path).toMatch(/already uses/);
	});

	it("allows duplicate regex and named locations, which nginx accepts", () => {
		expect(
			validateLocations([
				loc({ path: "~* \\.php$" }),
				loc({ path: "~*  \\.php$" }),
				loc({ path: "~ ^/api" }),
				loc({ path: "~ ^/api" }),
				loc({ path: "@fallback" }),
				loc({ path: "@fallback" }),
			]),
		).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
		// an exact location doesn't clash with the prefix location of the same URI
		expect(validateLocations([loc({ path: "= /x" }), loc({ path: "/x" })])).toEqual([undefined, undefined]);
	});

	it("flags duplicate paths after normalising the modifier", () => {
		const errors = validateLocations([loc({ path: "= /x" }), loc({ path: "=/x " }), loc({ path: "/x" })]);
		expect(errors[0]?.path).toMatch(/already uses = \/x/);
		expect(errors[1]?.path).toMatch(/already uses/);
		expect(errors[2]).toBeUndefined();
	});

	it("cleanLocations only drops completely blank rows", () => {
		const rows = [loc({ path: "", forwardHost: "" }), loc({ path: "", forwardHost: "app" })];
		expect(isBlankLocation(rows[0])).toBe(true);
		expect(cleanLocations(rows)).toEqual([rows[1]]);
	});

	it("cleanLocations trims the path and the forward host, the API refuses surrounding whitespace", () => {
		const [row] = cleanLocations([loc({ path: " /a/ ", forwardHost: " app/sub/ ", advancedConfig: " x " })]);
		expect(row.path).toBe("/a/");
		expect(row.forwardHost).toBe("app/sub/");
		expect(row.advancedConfig).toBe(" x ");
	});

	it("statusForRow only returns a status that still matches the row's path", () => {
		const statuses: NginxLocationStatus[] = [
			{ index: 0, path: "/a", status: "quarantined", mode: null, message: "no" },
		];
		expect(statusForRow(statuses, 0, loc({ path: "/a" }))?.status).toBe("quarantined");
		expect(statusForRow(statuses, 0, loc({ path: "/b" }))).toBeUndefined();
	});

	it("statusForRow drops a saved 'disabled' once the row is switched on again", () => {
		const statuses: NginxLocationStatus[] = [
			{ index: 0, path: "/a", status: "disabled", mode: null, message: null },
		];
		expect(statusForRow(statuses, 0, loc({ path: "/a", enabled: false }))?.status).toBe("disabled");
		expect(statusForRow(statuses, 0, loc({ path: "/a", enabled: true }))).toBeUndefined();
		expect(statusForRow(statuses, 0, loc({ path: "/a" }))).toBeUndefined();
	});
});

describe("LocationsFields", () => {
	beforeEach(() => {
		checkState.result = null;
		checkState.calls = [];
		checkState.candidates = undefined;
	});
	afterEach(() => cleanup());

	it("shows server status badges, hiding ok", () => {
		renderFields([loc({ path: "/ok" }), loc({ path: "/api" }), loc({ path: "/old" })], {
			statuses: [
				{ index: 0, path: "/ok", status: "ok", mode: "dynamic", message: null },
				{ index: 1, path: "/api", status: "quarantined", mode: null, message: "nginx rejected it" },
				{ index: 2, path: "/old", status: "unresolved", mode: "dynamic", message: null },
			],
		});
		expect(screen.getByTestId("location-card-0").querySelector("[data-status]")).toBeNull();
		expect(screen.getByTestId("location-card-1").querySelector("[data-status]")).toHaveAttribute(
			"data-status",
			"quarantined",
		);
		expect(screen.getByTestId("location-card-1")).toHaveTextContent("Not active");
		expect(screen.getByTestId("location-card-2")).toHaveTextContent("Unresolved");
	});

	it("toggles a location off and on via the enabled switch", () => {
		const { formValues } = renderFields([loc({ path: "/a" })]);
		const toggle = screen.getByLabelText("Enable or disable this location") as HTMLInputElement;
		expect(toggle.checked).toBe(true);
		fireEvent.click(toggle);
		expect(formValues()[0].enabled).toBe(false);
		expect(screen.getByTestId("location-card-0")).toHaveTextContent("Disabled");
		fireEvent.click(toggle);
		expect(formValues()[0].enabled).toBe(true);
	});

	it("doesn't keep a saved 'Disabled' badge after the location is switched on", () => {
		renderFields([loc({ path: "/api", enabled: false })], {
			statuses: [{ index: 0, path: "/api", status: "disabled", mode: null, message: null }],
		});
		const card = screen.getByTestId("location-card-0");
		expect(card.querySelector("[data-status]")).toHaveAttribute("data-status", "disabled");
		fireEvent.click(screen.getByLabelText("Enable or disable this location"));
		expect(card.querySelector("[data-status]")).toBeNull();
		expect(card).not.toHaveTextContent("Disabled");
	});

	it("a picked candidate fills in the port only while the user hasn't changed it", () => {
		checkState.candidates = {
			providers: {},
			items: [
				{ host: "svc", label: "svc", source: "docker", ports: [3000], hintPort: 3000, hintScheme: null },
				{ host: "other", label: "other", source: "docker", ports: [4000], hintPort: 4000, hintScheme: null },
			],
			generatedAt: "2026-11-04T10:00:00Z",
		};
		const { formValues } = renderFields([loc({ path: "/a", forwardHost: "", forwardPort: 80 })]);
		fireEvent.click(screen.getByText("/a"));
		const port = screen.getByPlaceholderText("eg: 8081") as HTMLInputElement;
		const host = document.querySelector("[id^=location-forwardHost-]") as HTMLInputElement;
		const pick = (name: string) => {
			fireEvent.focus(host);
			fireEvent.keyDown(host, { key: "ArrowDown", code: "ArrowDown" });
			fireEvent.click(screen.getByText(name));
		};
		// untouched port: filled in, and a later pick may replace what it filled in
		pick("svc");
		expect(host.value).toBe("svc");
		expect(port.value).toBe("3000");
		// the form holds the picked host together with its port, not only the inputs
		expect(formValues()[0]).toMatchObject({ forwardHost: "svc", forwardPort: 3000 });
		pick("other");
		expect(port.value).toBe("4000");
		expect(formValues()[0]).toMatchObject({ forwardHost: "other", forwardPort: 4000 });
		// a port the user typed stays
		fireEvent.change(port, { target: { value: "8443" } });
		pick("svc");
		expect(host.value).toBe("svc");
		expect(port.value).toBe("8443");
		expect(formValues()[0]).toMatchObject({ forwardHost: "svc", forwardPort: 8443 });
	});

	it("saves the picked container's host with the port and scheme it fills in", async () => {
		checkState.candidates = {
			providers: {},
			items: [
				{ host: "svc", label: "svc", source: "docker", ports: [3000], hintPort: 3000, hintScheme: "https" },
			],
			generatedAt: "2026-11-04T10:00:00Z",
		};
		const { onSubmit } = renderFields([loc({ path: "/a", forwardHost: "app", forwardPort: 80 })]);
		fireEvent.click(screen.getByText("/a"));
		const host = document.querySelector("[id^=location-forwardHost-]") as HTMLInputElement;
		fireEvent.focus(host);
		fireEvent.keyDown(host, { key: "ArrowDown", code: "ArrowDown" });
		fireEvent.click(screen.getByText("svc"));

		fireEvent.click(screen.getByText("save"));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
		expect(onSubmit.mock.calls[0][0].locations[0]).toMatchObject({
			forwardHost: "svc",
			forwardPort: 3000,
			forwardScheme: "https",
		});
	});

	it("blocks submit with invalid rows, expands them and shows the errors", async () => {
		const { onSubmit } = renderFields([loc({ path: "/a" }), loc({ path: "/a", forwardHost: "bad host" })]);
		// collapsed: no inputs visible yet
		expect(screen.queryByPlaceholderText("/path")).toBeNull();
		fireEvent.click(screen.getByText("save"));
		await waitFor(() => expect(screen.getAllByPlaceholderText("/path").length).toBe(2));
		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getAllByText(/Another location already uses \/a/).length).toBe(2);
		expect(screen.getByText("The host must not contain spaces")).toBeInTheDocument();
		expect(screen.getByTestId("location-card-1").querySelector(".is-invalid")).not.toBeNull();
		expect(screen.getAllByLabelText("This location has errors").length).toBe(2);
	});

	it("blocks a disabled row whose stored host is invalid, the API checks every row", async () => {
		const { onSubmit } = renderFields([loc({ path: "/old", enabled: false, forwardHost: "app;legacy" })]);
		fireEvent.click(screen.getByText("save"));
		await waitFor(() => expect(screen.getByText(/The host contains characters that are not allowed/)).toBeInTheDocument());
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("submits valid locations, storing the port as a number", async () => {
		const { onSubmit } = renderFields([loc({ path: "/a" })]);
		fireEvent.click(screen.getByText("/a"));
		fireEvent.change(screen.getByPlaceholderText("eg: 8081"), { target: { value: "8080" } });
		fireEvent.click(screen.getByText("save"));
		await waitFor(() => expect(onSubmit).toHaveBeenCalled());
		expect(onSubmit.mock.calls[0][0].locations[0].forwardPort).toBe(8080);
	});

	it("does not silently drop a row with content but no path", async () => {
		const { onSubmit, formValues } = renderFields([]);
		fireEvent.click(screen.getByText("Add Location"));
		fireEvent.change(screen.getByPlaceholderText("/path"), { target: { value: "/x" } });
		fireEvent.change(screen.getByPlaceholderText("/path"), { target: { value: "" } });
		const host = document.querySelector("[id^=location-forwardHost-]") as HTMLInputElement;
		fireEvent.change(host, { target: { value: "app" } });
		expect(formValues()).toHaveLength(1);
		fireEvent.click(screen.getByText("save"));
		await waitFor(() => expect(screen.getByText("This is required")).toBeInTheDocument());
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("opens the highlighted location", () => {
		renderFields([loc({ path: "/a" }), loc({ path: "/b" })], { highlightIndex: 1 });
		expect(screen.getAllByPlaceholderText("/path")).toHaveLength(1);
		expect((screen.getByPlaceholderText("/path") as HTMLInputElement).value).toBe("/b");
	});

	it("checks reachability once a card was opened and shows the result", () => {
		checkState.result = {
			host: "app",
			port: 80,
			ok: false,
			code: "tcp_refused",
			message: "Connection refused",
		};
		renderFields([loc({ path: "/a" })]);
		expect(checkState.calls.every((c) => !c.enabled)).toBe(true);
		fireEvent.click(screen.getByText("/a"));
		expect(checkState.calls.some((c) => c.enabled && c.input.host === "app" && c.input.port === 80)).toBe(true);
		expect(screen.getByTestId("location-card-0").querySelector("[data-check]")).toHaveAttribute(
			"data-check",
			"tcp_refused",
		);
		expect(screen.getByTestId("location-card-0")).toHaveTextContent("Connection refused");
	});

	for (const forwardHost of ["$backend", "$backend/api"]) {
		it(`doesn't check a forward host that is an nginx variable and says so (${forwardHost})`, () => {
			checkState.result = { host: "$backend", port: 80, ok: false, code: "invalid_host", message: "bad" };
			renderFields([loc({ path: "/a", forwardHost })]);
			fireEvent.click(screen.getByText("/a"));
			expect(checkState.calls.every((c) => !c.enabled)).toBe(true);
			const card = screen.getByTestId("location-card-0");
			expect(card.querySelector("[data-check]")).toHaveAttribute("data-check", "variable");
			expect(card).toHaveTextContent("nginx variable");
			expect(card).not.toHaveTextContent("Invalid host name");
			expect(card.querySelector(".invalid-feedback")).toBeNull();
		});
	}

	it("shows the advanced config of a location only to those who may change it", () => {
		renderFields([loc({ path: "/a", advancedConfig: "expires 1d;" })], { highlightIndex: 0 });
		fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
		expect(screen.getByDisplayValue("expires 1d;")).toBeInTheDocument();
		cleanup();

		renderFields([loc({ path: "/a", advancedConfig: "expires 1d;" })], { highlightIndex: 0, allowAdvanced: false });
		expect(screen.getByPlaceholderText("/path")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Advanced" })).toBeNull();
		expect(screen.queryByDisplayValue("expires 1d;")).toBeNull();
	});
});

describe("LocationsFields and the form value", () => {
	afterEach(cleanup);

	const renderWithReset = (initial: ProxyLocation[], reset: ProxyLocation[], readOnly = false) => {
		render(
			<Formik initialValues={{ locations: initial }} onSubmit={vi.fn()}>
				{({ values, resetForm }) => (
					<Form>
						<LocationsFields initialValues={initial} highlightIndex={0} readOnly={readOnly} />
						<output data-testid="values">{JSON.stringify(values.locations)}</output>
						<button type="button" onClick={() => resetForm({ values: { locations: reset } })}>
							reset
						</button>
					</Form>
				)}
			</Formik>,
		);
		return () => JSON.parse(screen.getByTestId("values").textContent || "[]") as ProxyLocation[];
	};

	it("shows the reset values after a reset, not newer local edits", async () => {
		// the modal resets the form to the submitted values after a save with warnings
		const submitted = [loc({ path: "/a", forwardHost: "app" })];
		const formValues = renderWithReset(submitted, submitted);
		fireEvent.change(screen.getByPlaceholderText("/path"), { target: { value: "/edited" } });
		fireEvent.click(screen.getByRole("button", { name: "Add Location" }));
		expect(formValues().map((l) => l.path)).toEqual(["/edited", ""]);

		fireEvent.click(screen.getByRole("button", { name: "reset" }));

		await waitFor(() => expect(screen.getAllByPlaceholderText("/path").map((i) => (i as HTMLInputElement).value)).toEqual(["/a"]));
		expect(formValues().map((l) => l.path)).toEqual(["/a"]);
		// the row stayed open and further edits go to the form again
		fireEvent.change(screen.getByPlaceholderText("/path"), { target: { value: "/b" } });
		expect(formValues().map((l) => l.path)).toEqual(["/b"]);
	});

	it("can't be edited while read-only", () => {
		const formValues = renderWithReset([loc({ path: "/a" })], [], true);
		const path = screen.getByPlaceholderText("/path");
		expect(path).toBeDisabled();
		expect(screen.getByRole("button", { name: "Add Location" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
		fireEvent.change(path, { target: { value: "/edited" } });
		fireEvent.click(screen.getByRole("button", { name: "Add Location" }));
		expect(formValues().map((l) => l.path)).toEqual(["/a"]);
		expect(path).toHaveValue("/a");
	});
});
